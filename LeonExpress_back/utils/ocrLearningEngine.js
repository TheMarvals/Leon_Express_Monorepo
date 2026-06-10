'use strict';

const { v4: uuidv4 } = require('uuid');
const { OcrCorrection, LearnedPattern, OcrProcessingQueue, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Motor de Aprendizaje OCR
 * 
 * Analiza las correcciones humanas para generar patrones que mejoran
 * la extracción automática. El sistema aprende de tres formas:
 * 
 * 1. SUSTITUCIONES: Si un valor siempre se corrige de A → B, crear regla
 * 2. LIMPIEZAS: Si siempre se elimina basura del inicio/final, crear regex
 * 3. FORMATOS: Si un campo siempre se reformatea de cierta manera, aprender
 */

class OcrLearningEngine {

  constructor() {
    this._isTraining = false;
    this._correctionsSinceLastTrain = 0;
    this.AUTO_TRAIN_THRESHOLD = 10; // Entrenar automáticamente cada N correcciones
  }

  /**
   * Registra las correcciones hechas por un humano al aprobar un paquete OCR
   * Compara extracted_data original vs corrected_data y guarda las diferencias
   */
  async recordCorrections(queueId, originalData, correctedData, userId, parserUsed, ocrRawText) {
    const corrections = [];
    const fieldsToTrack = [
      'recipient_name', 'destination_address', 'recipient_phone', 'external_tracking_code'
    ];

    for (const field of fieldsToTrack) {
      const original = (originalData?.[field] || '').toString().trim();
      const corrected = (correctedData?.[field] || '').toString().trim();

      // Solo registrar si hay diferencia real (ignorando case trivial para teléfonos)
      if (original !== corrected && corrected.length > 0) {
        // Determinar tipo de corrección
        let correctionType = 'manual_edit';
        
        if (!original || original.length === 0) {
          correctionType = 'field_added'; // El OCR no extrajo, el humano lo puso
        } else if (corrected.includes(original)) {
          correctionType = 'value_extended'; // Se le agregó algo
        } else if (original.includes(corrected)) {
          correctionType = 'value_trimmed'; // Se le quitó basura
        } else {
          correctionType = 'value_replaced'; // Se cambió completamente
        }

        const correction = {
          id: uuidv4(),
          queue_id: queueId,
          field_name: field,
          original_value: original || null,
          corrected_value: corrected,
          correction_type: correctionType,
          confidence_before: null, // Se llena abajo
          corrected_by: userId,
          parser_used: parserUsed || null,
          ocr_raw_text: ocrRawText || null,
        };

        corrections.push(correction);
      }
    }

    if (corrections.length === 0) {
      console.log('📝 [LEARNING] Sin correcciones detectadas (datos idénticos)');
      return { recorded: 0 };
    }

    // Obtener confidence scores del item original
    try {
      const queueItem = await OcrProcessingQueue.findByPk(queueId);
      if (queueItem) {
        const confidenceScores = typeof queueItem.confidence_scores === 'string'
          ? JSON.parse(queueItem.confidence_scores)
          : (queueItem.confidence_scores || {});

        corrections.forEach(c => {
          c.confidence_before = confidenceScores[c.field_name] || null;
        });
      }
    } catch (err) {
      console.warn('⚠️ [LEARNING] No se pudo obtener confidence_scores:', err.message);
    }

    // Guardar correcciones en batch
    try {
      await OcrCorrection.bulkCreate(corrections);
      console.log(`📝 [LEARNING] ${corrections.length} corrección(es) registrada(s):`);
      corrections.forEach(c => {
        console.log(`   • ${c.field_name}: "${c.original_value?.substring(0, 40)}..." → "${c.corrected_value?.substring(0, 40)}..." [${c.correction_type}]`);
      });
    } catch (err) {
      console.error('❌ [LEARNING] Error al guardar correcciones:', err.message);
    }

    // Auto-entrenamiento: disparar train() en background cuando hay suficientes correcciones
    this._correctionsSinceLastTrain += corrections.length;
    if (this._correctionsSinceLastTrain >= this.AUTO_TRAIN_THRESHOLD) {
      console.log(`🧠 [LEARNING] Auto-entrenamiento disparado (${this._correctionsSinceLastTrain} correcciones acumuladas)`);
      this._correctionsSinceLastTrain = 0;
      // No await — ejecutar en background para no bloquear la respuesta al usuario
      this.train().catch(err => {
        console.error('❌ [LEARNING] Error en auto-entrenamiento:', err.message);
      });
    }

    return {
      recorded: corrections.length,
      corrections: corrections.map(c => ({
        field: c.field_name,
        type: c.correction_type,
        original: c.original_value,
        corrected: c.corrected_value,
      }))
    };
  }

  /**
   * Ejecuta un ciclo de entrenamiento:
   * Analiza correcciones acumuladas y genera/actualiza patrones aprendidos
   */
  async train() {
    // Evitar ejecuciones concurrentes
    if (this._isTraining) {
      console.log('🧠 [LEARNING] Entrenamiento ya en progreso, saltando...');
      return { skipped: true, reason: 'already_training' };
    }
    this._isTraining = true;

    console.log('\n🧠 ═══════════════════════════════════════════');
    console.log('🧠 INICIANDO CICLO DE ENTRENAMIENTO OCR');
    console.log('🧠 ═══════════════════════════════════════════\n');

    const startTime = Date.now();
    const results = {
      corrections_analyzed: 0,
      patterns_created: 0,
      patterns_updated: 0,
      patterns_deactivated: 0,
    };

    try {
      // 1. Obtener todas las correcciones agrupadas
      const correctionGroups = await this._getGroupedCorrections();
      results.corrections_analyzed = correctionGroups.length;
      console.log(`📊 Grupos de correcciones encontrados: ${correctionGroups.length}`);

      // 2. Para cada grupo, decidir si merece un patrón
      for (const group of correctionGroups) {
        await this._processGroup(group, results);
      }

      // 3. Aprender sustituciones directas (valor A siempre → valor B)
      await this._learnSubstitutions(results);

      // 4. Aprender patrones de limpieza (siempre se elimina X del campo Y)
      await this._learnCleanupPatterns(results);

      // 5. Desactivar patrones con baja efectividad
      await this._deactivateBadPatterns(results);

      results.duration_ms = Date.now() - startTime;

      console.log('\n🧠 ═══════════════════════════════════════════');
      console.log('🧠 ENTRENAMIENTO COMPLETADO');
      console.log(`🧠   Correcciones analizadas: ${results.corrections_analyzed}`);
      console.log(`🧠   Patrones creados: ${results.patterns_created}`);
      console.log(`🧠   Patrones actualizados: ${results.patterns_updated}`);
      console.log(`🧠   Patrones desactivados: ${results.patterns_deactivated}`);
      console.log(`🧠   Duración: ${results.duration_ms}ms`);
      console.log('🧠 ═══════════════════════════════════════════\n');

      return results;
    } catch (err) {
      console.error('❌ [TRAINING] Error en ciclo de entrenamiento:', err);
      throw err;
    } finally {
      this._isTraining = false;
    }
  }

  /**
   * Obtiene correcciones agrupadas por parser + campo + tipo
   */
  async _getGroupedCorrections() {
    const results = await sequelize.query(`
      SELECT 
        parser_used,
        field_name,
        correction_type,
        COUNT(*) as occurrence_count,
        GROUP_CONCAT(DISTINCT original_value SEPARATOR '|||') as original_values,
        GROUP_CONCAT(DISTINCT corrected_value SEPARATOR '|||') as corrected_values,
        MIN(created_at) as first_seen,
        MAX(created_at) as last_seen
      FROM ocr_corrections
      GROUP BY parser_used, field_name, correction_type
      HAVING COUNT(*) >= 2
      ORDER BY occurrence_count DESC
    `, { type: sequelize.QueryTypes.SELECT });

    return results;
  }

  /**
   * Procesa un grupo de correcciones similares
   */
  async _processGroup(group, results) {
    const { parser_used, field_name, correction_type, occurrence_count } = group;

    console.log(`\n  📋 Grupo: ${parser_used}/${field_name} [${correction_type}] (${occurrence_count} correcciones)`);

    // Solo crear patrones si hay suficientes correcciones
    if (occurrence_count < 3) {
      console.log(`     ⏭️  Insuficientes correcciones (mínimo 3), saltando`);
      return;
    }

    // Para correcciones de tipo "value_trimmed" podemos aprender qué se recorta
    if (correction_type === 'value_trimmed') {
      await this._learnTrimmingPattern(group, results);
    }
  }

  /**
   * Aprende qué texto se debe recortar de un campo
   */
  async _learnTrimmingPattern(group, results) {
    const { parser_used, field_name } = group;

    // Obtener las correcciones individuales de este grupo
    const corrections = await OcrCorrection.findAll({
      where: {
        parser_used: parser_used,
        field_name: field_name,
        correction_type: 'value_trimmed',
      },
      order: [['created_at', 'DESC']],
      limit: 50,
    });

    // Analizar qué se elimina
    const removedParts = [];
    for (const c of corrections) {
      const orig = c.original_value || '';
      const corrected = c.corrected_value || '';
      
      if (orig.includes(corrected)) {
        const before = orig.substring(0, orig.indexOf(corrected)).trim();
        const after = orig.substring(orig.indexOf(corrected) + corrected.length).trim();
        
        if (before.length > 0) removedParts.push({ position: 'prefix', text: before });
        if (after.length > 0) removedParts.push({ position: 'suffix', text: after });
      }
    }

    // Agrupar partes eliminadas y buscar patrones frecuentes
    const prefixes = removedParts.filter(p => p.position === 'prefix').map(p => p.text);
    const suffixes = removedParts.filter(p => p.position === 'suffix').map(p => p.text);

    // Encontrar prefijos comunes
    const commonPrefixes = this._findCommonParts(prefixes);
    for (const prefix of commonPrefixes) {
      await this._createOrUpdatePattern({
        patternName: `trim_prefix_${parser_used}_${field_name}_${prefix.hash}`,
        patternType: 'trim_prefix',
        regexPattern: `^${this._escapeRegex(prefix.text)}\\s*`,
        replacement: '',
        fieldName: field_name,
        parserName: parser_used,
        sourceCorrections: prefix.examples,
      }, results);
    }

    // Encontrar sufijos comunes
    const commonSuffixes = this._findCommonParts(suffixes);
    for (const suffix of commonSuffixes) {
      await this._createOrUpdatePattern({
        patternName: `trim_suffix_${parser_used}_${field_name}_${suffix.hash}`,
        patternType: 'trim_suffix',
        regexPattern: `\\s*${this._escapeRegex(suffix.text)}$`,
        replacement: '',
        fieldName: field_name,
        parserName: parser_used,
        sourceCorrections: suffix.examples,
      }, results);
    }
  }

  /**
   * Aprende sustituciones directas (si valor A siempre → B)
   */
  async _learnSubstitutions(results) {
    // Buscar pares original→corrected que aparezcan 3+ veces
    const substitutions = await sequelize.query(`
      SELECT 
        parser_used, field_name,
        original_value, corrected_value,
        COUNT(*) as count
      FROM ocr_corrections
      WHERE correction_type = 'value_replaced'
        AND original_value IS NOT NULL
        AND LENGTH(original_value) > 0
      GROUP BY parser_used, field_name, original_value, corrected_value
      HAVING COUNT(*) >= 3
      ORDER BY count DESC
      LIMIT 50
    `, { type: sequelize.QueryTypes.SELECT });

    for (const sub of substitutions) {
      const hash = this._simpleHash(sub.original_value);
      await this._createOrUpdatePattern({
        patternName: `sub_${sub.parser_used}_${sub.field_name}_${hash}`,
        patternType: 'substitution',
        regexPattern: `^${this._escapeRegex(sub.original_value)}$`,
        replacement: sub.corrected_value,
        fieldName: sub.field_name,
        parserName: sub.parser_used,
        sourceCorrections: [{ original: sub.original_value, corrected: sub.corrected_value, count: sub.count }],
      }, results);
    }
  }

  /**
   * Aprende patrones de limpieza comunes a todos los parsers
   */
  async _learnCleanupPatterns(results) {
    // Buscar limpiezas comunes: caracteres basura frecuentes
    const cleanups = await sequelize.query(`
      SELECT 
        field_name,
        SUBSTRING(original_value, 1, 20) as prefix_sample,
        COUNT(*) as count
      FROM ocr_corrections
      WHERE correction_type IN ('value_trimmed', 'manual_edit')
        AND original_value IS NOT NULL
      GROUP BY field_name, SUBSTRING(original_value, 1, 20)
      HAVING COUNT(*) >= 5
      ORDER BY count DESC
      LIMIT 20
    `, { type: sequelize.QueryTypes.SELECT });

    for (const cleanup of cleanups) {
      console.log(`  🧹 Limpieza frecuente en ${cleanup.field_name}: "${cleanup.prefix_sample}..." (${cleanup.count}x)`);
    }
  }

  /**
   * Desactiva patrones con baja efectividad (success_rate < 50% después de 10+ usos)
   */
  async _deactivateBadPatterns(results) {
    const badPatterns = await LearnedPattern.findAll({
      where: {
        is_active: true,
        usage_count: { [Op.gte]: 10 },
        success_rate: { [Op.lt]: 50 },
      }
    });

    for (const pattern of badPatterns) {
      await pattern.update({ is_active: false });
      console.log(`  ❌ Patrón desactivado (baja eficacia): ${pattern.pattern_name} (${pattern.success_rate}%)`);
      results.patterns_deactivated++;
    }
  }

  /**
   * Crea o actualiza un patrón aprendido
   */
  async _createOrUpdatePattern(data, results) {
    const { patternName, patternType, regexPattern, replacement, fieldName, parserName, sourceCorrections } = data;

    try {
      const existing = await LearnedPattern.findOne({ where: { pattern_name: patternName } });

      if (existing) {
        // Actualizar fuente de correcciones y mantener estadísticas
        await existing.update({
          regex_pattern: regexPattern,
          replacement: replacement || null,
          source_corrections: sourceCorrections,
        });
        results.patterns_updated++;
        console.log(`     ♻️  Patrón actualizado: ${patternName}`);
      } else {
        await LearnedPattern.create({
          id: uuidv4(),
          pattern_name: patternName,
          pattern_type: patternType,
          regex_pattern: regexPattern,
          replacement: replacement || '',
          field_name: fieldName,
          parser_name: parserName,
          confidence_threshold: 80,
          usage_count: 0,
          success_count: 0,
          success_rate: 0,
          is_active: true,
          source_corrections: sourceCorrections,
        });
        results.patterns_created++;
        console.log(`     ✅ Nuevo patrón creado: ${patternName}`);
      }
    } catch (err) {
      console.error(`     ❌ Error al guardar patrón ${patternName}:`, err.message);
    }
  }

  /**
   * Aplica patrones aprendidos a un valor extraído por OCR
   * Se llama desde smartOcrParser.js después de la extracción
   */
  async applyLearnedPatterns(extractedData, parserUsed) {
    let patternsApplied = 0;
    
    try {
      // Obtener patrones activos para este parser (o genéricos)
      const patterns = await LearnedPattern.findAll({
        where: {
          is_active: true,
          [Op.or]: [
            { parser_name: parserUsed },
            { parser_name: null },
            { parser_name: '' },
          ]
        },
        order: [['success_rate', 'DESC'], ['usage_count', 'DESC']],
      });

      if (patterns.length === 0) return { data: extractedData, patternsApplied: 0 };

      const enhancedData = { ...extractedData };

      for (const pattern of patterns) {
        const fieldName = pattern.field_name;
        if (!fieldName || !enhancedData[fieldName]) continue;

        const originalValue = enhancedData[fieldName];
        let newValue = originalValue;

        try {
          const regex = new RegExp(pattern.regex_pattern, 'i');

          switch (pattern.pattern_type) {
            case 'trim_prefix':
            case 'trim_suffix':
              newValue = originalValue.replace(regex, pattern.replacement || '').trim();
              break;

            case 'substitution':
              if (regex.test(originalValue)) {
                newValue = pattern.replacement || originalValue;
              }
              break;

            case 'cleanup':
              newValue = originalValue.replace(regex, pattern.replacement || '').trim();
              break;
          }

          // Si el valor cambió, registrar uso
          if (newValue !== originalValue) {
            enhancedData[fieldName] = newValue;
            patternsApplied++;

            // Incrementar usage_count (no bloquear el flujo)
            pattern.increment('usage_count').catch(() => {});

            console.log(`  🧠 Patrón aplicado [${pattern.pattern_name}]: "${originalValue.substring(0, 30)}..." → "${newValue.substring(0, 30)}..."`);
          }
        } catch (regexErr) {
          console.warn(`⚠️ Regex inválido en patrón ${pattern.pattern_name}:`, regexErr.message);
        }
      }

      return { data: enhancedData, patternsApplied };
    } catch (err) {
      console.warn('⚠️ [LEARNING] Error al aplicar patrones:', err.message);
      return { data: extractedData, patternsApplied: 0 };
    }
  }

  /**
   * Registra si un patrón aplicado fue exitoso (el reviewer no lo corrigió de nuevo)
   */
  async recordPatternSuccess(queueId, wasAutoApproved) {
    // Si fue auto-aprobado y no fue corregido después, los patrones aplicados fueron exitosos
    if (!wasAutoApproved) return;

    try {
      // Buscar qué patrones se aplicaron (los que incrementaron usage_count recientemente)
      // Simplificación: incrementar success_count de todos los patrones activos usados
      await LearnedPattern.update(
        {
          success_count: sequelize.literal('success_count + 1'),
          success_rate: sequelize.literal('ROUND((success_count + 1) / GREATEST(usage_count, 1) * 100, 2)'),
        },
        {
          where: {
            is_active: true,
            usage_count: { [Op.gt]: 0 },
          }
        }
      );
    } catch (err) {
      console.warn('⚠️ [LEARNING] Error al registrar éxito:', err.message);
    }
  }

  /**
   * Obtiene estadísticas del sistema de aprendizaje
   */
  async getStats() {
    try {
      const [
        totalCorrections,
        correctionsByField,
        correctionsByParser,
        activePatterns,
        recentCorrections,
        topPatterns,
      ] = await Promise.all([
        OcrCorrection.count(),
        
        sequelize.query(`
          SELECT field_name, COUNT(*) as count, 
                 AVG(confidence_before) as avg_confidence_before
          FROM ocr_corrections 
          GROUP BY field_name 
          ORDER BY count DESC
        `, { type: sequelize.QueryTypes.SELECT }),

        sequelize.query(`
          SELECT parser_used, COUNT(*) as count
          FROM ocr_corrections 
          GROUP BY parser_used 
          ORDER BY count DESC
        `, { type: sequelize.QueryTypes.SELECT }),

        LearnedPattern.count({ where: { is_active: true } }),

        OcrCorrection.findAll({
          order: [['created_at', 'DESC']],
          limit: 20,
          attributes: ['id', 'field_name', 'original_value', 'corrected_value', 'correction_type', 'parser_used', 'created_at'],
        }),

        LearnedPattern.findAll({
          where: { is_active: true },
          order: [['success_rate', 'DESC'], ['usage_count', 'DESC']],
          limit: 10,
        }),
      ]);

      // Calcular tasa de mejora: promedio de confianza antes vs ahora
      const autoApprovalRate = await sequelize.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as total,
          SUM(CASE WHEN auto_approved = 1 THEN 1 ELSE 0 END) as auto_approved,
          ROUND(SUM(CASE WHEN auto_approved = 1 THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) as approval_rate
        FROM ocr_processing_queue
        WHERE processed_at IS NOT NULL
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 14
      `, { type: sequelize.QueryTypes.SELECT });

      return {
        total_corrections: totalCorrections,
        corrections_by_field: correctionsByField,
        corrections_by_parser: correctionsByParser,
        active_patterns: activePatterns,
        recent_corrections: recentCorrections,
        top_patterns: topPatterns,
        auto_approval_trend: autoApprovalRate,
      };
    } catch (err) {
      console.error('❌ [LEARNING] Error al obtener estadísticas:', err);
      throw err;
    }
  }

  // === HELPERS ===

  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit
    }
    return Math.abs(hash).toString(36).substring(0, 8);
  }

  _findCommonParts(parts) {
    const frequency = {};
    parts.forEach(text => {
      const normalized = text.trim().toLowerCase();
      if (normalized.length < 2) return;
      if (!frequency[normalized]) {
        frequency[normalized] = { text, count: 0, examples: [] };
      }
      frequency[normalized].count++;
      if (frequency[normalized].examples.length < 5) {
        frequency[normalized].examples.push(text);
      }
    });

    return Object.values(frequency)
      .filter(f => f.count >= 2)
      .map(f => ({
        text: f.text,
        hash: this._simpleHash(f.text),
        count: f.count,
        examples: f.examples,
      }));
  }
}

// Singleton
const learningEngine = new OcrLearningEngine();

module.exports = learningEngine;
