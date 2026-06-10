const { DriverPayout, PayoutItem, User } = require('./models');

async function createTestPayouts() {
  try {
    // ID del driver del token
    const driverId = '95b08763-09d0-4f64-8990-1feeca5d7225';
    
    console.log('Creando datos de prueba para driver:', driverId);
    
    // Crear un payout de prueba
    const payout = await DriverPayout.create({
      payout_id: require('uuid').v4(),
      user_id: driverId,
      period_id: null, // Puede ser null por ahora
      total_amount: 150000, // $150,000 CLP
      payout_date: new Date('2024-12-01'),
      status: 'PAGADO',
      created_at: new Date(),
      updated_at: new Date()
    });
    
    console.log('Payout creado:', payout.payout_id);
    
    // Crear algunos items del payout
    await PayoutItem.create({
      payout_item_id: require('uuid').v4(),
      payout_id: payout.payout_id,
      package_id: null, // Puede ser null por ahora
      pickup_id: null,
      amount: 50000,
      description: 'Entrega paquete #1',
      created_at: new Date()
    });
    
    await PayoutItem.create({
      payout_item_id: require('uuid').v4(),
      payout_id: payout.payout_id,
      package_id: null,
      pickup_id: null,
      amount: 75000,
      description: 'Entrega paquete #2',
      created_at: new Date()
    });
    
    await PayoutItem.create({
      payout_item_id: require('uuid').v4(),
      payout_id: payout.payout_id,
      package_id: null,
      pickup_id: null,
      amount: 25000,
      description: 'Bonus por puntualidad',
      created_at: new Date()
    });
    
    console.log('Items de payout creados');
    
    // Crear otro payout para el mes pasado
    const payout2 = await DriverPayout.create({
      payout_id: require('uuid').v4(),
      user_id: driverId,
      period_id: null,
      total_amount: 125000,
      payout_date: new Date('2024-11-01'),
      status: 'PAGADO',
      created_at: new Date(),
      updated_at: new Date()
    });
    
    await PayoutItem.create({
      payout_item_id: require('uuid').v4(),
      payout_id: payout2.payout_id,
      package_id: null,
      pickup_id: null,
      amount: 125000,
      description: 'Entregas mes anterior',
      created_at: new Date()
    });
    
    console.log('Datos de prueba creados exitosamente');
    console.log('Total payouts para driver:', driverId, '= $275,000 CLP');
    
  } catch (error) {
    console.error('Error creando datos de prueba:', error);
  }
}

createTestPayouts();