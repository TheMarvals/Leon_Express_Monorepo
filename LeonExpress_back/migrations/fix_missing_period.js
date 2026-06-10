require('dotenv').config();
const { Sequelize } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        dialect: 'mysql',
        logging: false
    }
);

// Auxiliar para formatear fechas en YYYY-MM-DD usando hora local
function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Funciones auxiliares para calcular semana (ISO 8601, modo 1 como MySQL WEEK)
function getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(12, 0, 0, 0);
    const jan4 = new Date(d.getFullYear(), 0, 4);
    jan4.setHours(0, 0, 0, 0);
    const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 86400000) + 1;
    const jan4Day = Math.floor((jan4 - new Date(jan4.getFullYear(), 0, 1)) / 86400000) + 1;
    const jan4Weekday = jan4.getDay() || 7;
    const week1Start = jan4Day - jan4Weekday + 1;

    let weekNumber;
    if (dayOfYear < week1Start) {
        const lastYear = d.getFullYear() - 1;
        const lastDayOfYear = Math.floor((new Date(lastYear, 11, 31) - new Date(lastYear, 0, 1)) / 86400000) + 1;
        const lastJan4 = new Date(lastYear, 0, 4);
        const lastJan4Day = Math.floor((lastJan4 - new Date(lastYear, 0, 1)) / 86400000) + 1;
        const lastJan4Weekday = lastJan4.getDay() || 7;
        const lastWeek1Start = lastJan4Day - lastJan4Weekday + 1;
        weekNumber = Math.ceil((dayOfYear + lastDayOfYear - lastWeek1Start + 1) / 7);
    } else {
        weekNumber = Math.ceil((dayOfYear - week1Start + 1) / 7);
    }
    return weekNumber;
}

function getWeekStartDate(year, week) {
    const jan4 = new Date(year, 0, 4);
    jan4.setHours(0, 0, 0, 0);
    const jan4Day = Math.floor((jan4 - new Date(year, 0, 1)) / 86400000) + 1;
    const jan4Weekday = jan4.getDay() || 7;
    const week1Start = jan4Day - jan4Weekday + 1;
    const dayOfYear = week1Start + (week - 1) * 7;
    const date = new Date(year, 0, 1);
    date.setDate(dayOfYear);
    const weekday = date.getDay() || 7;
    date.setDate(date.getDate() - weekday + 1);
    return date;
}

async function createMissingNextPeriod() {
    console.log('🔍 Buscando período faltante...');

    try {
        // 1. Obtener último período cerrado
        const [lastClosed] = await sequelize.query(`
      SELECT * FROM billing_periods 
      WHERE period_type = 'WEEKLY' AND status = 'CLOSED' 
      ORDER BY end_date DESC 
      LIMIT 1
    `, { type: sequelize.QueryTypes.SELECT });

        if (!lastClosed) {
            console.log('⚠️ No hay períodos cerrados recientes.');
            return;
        }

        console.log(`✅ Último cerrado: Semana ${lastClosed.period_number} (${lastClosed.end_date})`);

        // 2. Calcular siguiente semana
        const lastEndDate = new Date(lastClosed.end_date + 'T12:00:00'); // Tratar como local
        const nextStartDate = new Date(lastEndDate);
        nextStartDate.setDate(nextStartDate.getDate() + 1); // Lunes siguiente

        const nextEndDate = new Date(nextStartDate);
        nextEndDate.setDate(nextStartDate.getDate() + 6); // Domingo siguiente

        const startStr = getLocalDateString(nextStartDate);
        const endStr = getLocalDateString(nextEndDate);

        // 3. Verificar si existe
        const [exists] = await sequelize.query(`
      SELECT * FROM billing_periods 
      WHERE period_type = 'WEEKLY' AND start_date = :startStr
    `, {
            replacements: { startStr },
            type: sequelize.QueryTypes.SELECT
        });

        if (exists) {
            console.log(`ℹ️ El período siguiente (${startStr} - ${endStr}) YA EXISTE.`);
            return;
        }

        // 4. Crear si falta
        console.log(`✨ Creando período faltante: ${startStr} al ${endStr}`);

        const yearNumber = nextStartDate.getFullYear();
        const weekNumber = getWeekNumber(nextStartDate);
        const periodId = uuidv4();

        await sequelize.query(`
      INSERT INTO billing_periods (period_id, period_type, start_date, end_date, year_number, period_number, status)
      VALUES (:periodId, 'WEEKLY', :startStr, :endStr, :yearNumber, :weekNumber, 'ACTIVE')
    `, {
            replacements: { periodId, startStr, endStr, yearNumber, weekNumber }
        });

        console.log('✅ Período creado exitosamente.');

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// Ejecutar migración si se llama directamente
if (require.main === module) {
    require('dotenv').config();
    createMissingNextPeriod().then(() => process.exit());
}

module.exports = createMissingNextPeriod;
