const { extractTrackingCodeFromQR } = require('./utils/qrDecoder');

const testJson = `{"id":"45659671517","sender_id":1513023287,"hash_code":"3LbN6YWBvdstRaTnCc78Ko6ytHmX04IFCyB4BPi69/s=","security_digit":"0"}`;

console.log('Testing ML JSON QR Format:');
const result = extractTrackingCodeFromQR(testJson);
console.log('Result:', result);

if (result === '45659671517') {
    console.log('✅ Success! Correct code extracted.');
} else {
    console.log('❌ Failure! Expected 45659671517 but got', result);
}
