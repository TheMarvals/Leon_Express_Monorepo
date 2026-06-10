/**
 * Test del Sistema de Auto-Aprendizaje OCR
 * 
 * Ejecutar en el VPS dentro del contenedor backend:
 *   docker exec -it leonexpress_backend node test_learning_system.js
 * 
 * O localmente si tienes acceso a la BD:
 *   node test_learning_system.js
 */
require('dotenv').config();

async function run() {
  console.log('🧠 ═══════════════════════════════════════════');
  console.log('🧠 TEST: Sistema de Auto-Aprendizaje OCR');
  console.log('🧠 ═══════════════════════════════════════════\n');
  console.log(`   DB: ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME}\n`);

  // Usar Sequelize (mismo que la app)
  const { OcrCorrection, LearnedPattern, OcrProcessingQueue, sequelize } = require('./models');

  try {
    await sequelize.authenticate();
    console.log('✅ Conexión a BD establecida\n');
  } catch (err) {
    console.error('❌ No se pudo conectar a la BD:', err.message);
    console.error('   Si estás en local, ejecuta este script dentro del contenedor:');
    console.error('   docker exec -it leonexpress_backend node test_learning_system.js');
    process.exit(1);
  }

  try {
    // ═══ PASO 1: Verificar tablas ═══
    console.log('📋 PASO 1: Verificando tablas...');
    const [tableCheck] = await sequelize.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME}' 
        AND TABLE_NAME IN ('ocr_corrections', 'learned_patterns')
    `);
    const tableNames = tableCheck.map(t => t.TABLE_NAME);
    console.log(`   ocr_corrections: ${tableNames.includes('ocr_corrections') ? '✅' : '❌'}`);
    console.log(`   learned_patterns: ${tableNames.includes('learned_patterns') ? '✅' : '❌'}\n`);

    // ═══ PASO 2: Estado actual de correcciones ═══
    console.log('📋 PASO 2: Correcciones registradas...');
    const totalCorrections = await OcrCorrection.count();
    console.log(`   Total: ${totalCorrections}`);

    if (totalCorrections > 0) {
      const byField = await sequelize.query(`
        SELECT field_name, correction_type, COUNT(*) as cnt
        FROM ocr_corrections
        GROUP BY field_name, correction_type
        ORDER BY cnt DESC
      `, { type: sequelize.QueryTypes.SELECT });
      byField.forEach(r => console.log(`   • ${r.field_name} [${r.correction_type}]: ${r.cnt}`));
    }
    console.log('');

    // ═══ PASO 3: Patrones aprendidos ═══
    console.log('📋 PASO 3: Patrones aprendidos...');
    const totalPatterns = await LearnedPattern.count();
    const activePatterns = await LearnedPattern.count({ where: { is_active: true } });
    console.log(`   Total: ${totalPatterns} (${activePatterns} activos)`);

    if (totalPatterns > 0) {
      const patterns = await LearnedPattern.findAll({
        order: [['usage_count', 'DESC']],
        limit: 5
      });
      patterns.forEach(p => {
        console.log(`   • ${p.pattern_name} [${p.pattern_type}] → ${p.field_name}`);
        console.log(`     Uso: ${p.usage_count}, Éxito: ${p.success_rate}%, Activo: ${p.is_active}`);
      });
    }
    console.log('');

    // ═══ PASO 4: Tasa de auto-aprobación ═══
    console.log('📋 PASO 4: Tasa de auto-aprobación...');
    const [rates] = await sequelize.query(`
      SELECT 
        DATE(processed_at) as fecha,
        COUNT(*) as total,
        SUM(CASE WHEN auto_approved = 1 THEN 1 ELSE 0 END) as auto,
        ROUND(SUM(CASE WHEN auto_approved = 1 THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) as pct
      FROM ocr_processing_queue
      WHERE processed_at IS NOT NULL
      GROUP BY DATE(processed_at)
      ORDER BY fecha DESC
      LIMIT 7
    `);
    if (rates.length > 0) {
      rates.forEach(r => console.log(`   ${r.fecha}: ${r.auto}/${r.total} auto-aprobados (${r.pct}%)`));
    } else {
      console.log('   Sin datos de procesamiento aún');
    }
    console.log('');

    // ═══ PASO 5: Verificar integración recordCorrections ═══
    console.log('📋 PASO 5: Verificando que recordCorrections funciona...');
    const [recentManual] = await sequelize.query(`
      SELECT q.id, q.reviewed_at, q.parser_used,
        (SELECT COUNT(*) FROM ocr_corrections c WHERE c.queue_id = q.id) as n_corrections
      FROM ocr_processing_queue q
      WHERE q.status = 'completed' AND q.auto_approved = 0 AND q.reviewed_by IS NOT NULL
      ORDER BY q.reviewed_at DESC
      LIMIT 5
    `);
    if (recentManual.length > 0) {
      let connected = false;
      recentManual.forEach(r => {
        const status = r.n_corrections > 0 ? '✅' : '⚠️';
        if (r.n_corrections > 0) connected = true;
        console.log(`   ${status} Queue ${r.id.substring(0, 8)}... | ${r.parser_used} | ${r.n_corrections} correcciones | ${r.reviewed_at}`);
      });
      if (connected) {
        console.log('   ✅ recordCorrections ESTÁ FUNCIONANDO');
      } else {
        console.log('   ⚠️  Paquetes aprobados sin correcciones (puede que no hubo cambios, o recordCorrections no estaba conectado)');
      }
    } else {
      console.log('   Sin aprobaciones manuales recientes');
    }
    console.log('');

    // ═══ PASO 6: Learning Engine test ═══
    console.log('📋 PASO 6: Test del Learning Engine...');
    const learningEngine = require('./utils/ocrLearningEngine');
    console.log(`   ✅ Engine cargado`);
    console.log(`   AUTO_TRAIN_THRESHOLD: ${learningEngine.AUTO_TRAIN_THRESHOLD}`);
    console.log(`   _isTraining: ${learningEngine._isTraining}`);
    console.log(`   _correctionsSinceLastTrain: ${learningEngine._correctionsSinceLastTrain}`);

    // Test de train()
    console.log('\n🧠 Ejecutando ciclo de entrenamiento...');
    const trainResult = await learningEngine.train();
    console.log('\n📊 Resultado:');
    console.log(JSON.stringify(trainResult, null, 2));

    // Verificar patrones después del entrenamiento
    const patternsAfter = await LearnedPattern.count({ where: { is_active: true } });
    console.log(`\n   Patrones activos después del entrenamiento: ${patternsAfter}`);

    // ═══ RESUMEN ═══
    console.log('\n\n🧠 ═══════════════════════════════════════════');
    console.log('🧠 RESUMEN');
    console.log('🧠 ═══════════════════════════════════════════');
    console.log(`   Tablas:              ${tableNames.length === 2 ? '✅ OK' : '❌ FALTAN'}`);
    console.log(`   Correcciones:        ${totalCorrections}`);
    console.log(`   Patrones activos:    ${patternsAfter}`);
    console.log(`   Auto-train threshold: ${learningEngine.AUTO_TRAIN_THRESHOLD}`);
    
    if (totalCorrections === 0) {
      console.log('\n   💡 El sistema necesita correcciones humanas para aprender.');
      console.log('   Cuando un reviewer apruebe un paquete OCR corrigiendo datos,');
      console.log('   las correcciones se registrarán automáticamente.');
      console.log('   Después de 10 correcciones, el entrenamiento se ejecutará solo.');
    } else if (patternsAfter === 0 && totalCorrections < 3) {
      console.log('\n   💡 Aún no hay suficientes correcciones para generar patrones.');
      console.log(`   Se necesitan al menos 3 correcciones iguales. Actualmente hay ${totalCorrections}.`);
    }
    
    console.log('🧠 ═══════════════════════════════════════════\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

run();
