const axios = require('axios');

async function test() {
  try {
    // 1. Get token
    const loginRes = await axios.post('http://localhost:4000/api/auth/login', {
      username: 'admin',
      password: 'ThomasMarval2105..'
    });
    const token = loginRes.data.token;
    console.log('Login OK. Token obtained.');

    // 2. Test Accounts
    console.log('\n--- Testing Accounts ---');
    try {
      const accountsRes = await axios.get('http://localhost:4000/api/mercadolibre/accounts', {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Accounts Response:', accountsRes.status, accountsRes.data);
    } catch(err) {
      console.error('Accounts Error:', err.response ? err.response.status : '', err.response ? err.response.data : err.message);
    }

    // 3. Test Generate Link
    console.log('\n--- Testing Generate Link ---');
    try {
      const linkRes = await axios.post('http://localhost:4000/api/mercadolibre/generate-link/test-client-123', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Link Response:', linkRes.status, linkRes.data);
    } catch(err) {
      console.error('Link Error:', err.response ? err.response.status : '', err.response ? err.response.data : err.message);
    }
  } catch (err) {
    console.error('Main error:', err);
  }
}
test();
