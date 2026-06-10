const { extractData, selectParser, shouldAutoApprove } = require('./utils/smartOcrParser.js');

const texts = [
    "Venta ID: 2000013363147881\nRoccvlu vs10 pUrte d lu elque: , pcIO que fu poqjuete vluje susur@\nFreldora De Aire 6 Luros Digltal 2400w 220v Negra Diorada Canasto ÚnIco SKU: 36156-NL\nUnldad\nLEON IMPORT SPA LEÓN IMpO #15136,23287 Andrea Dorla 2/20 Pedi o Aguie Ceidal, Peuro Agulne Cenla, RM (Metropolntana) Vente: 2000613363147880 Envio: 45661088516\nEnvío Turbo Entrega: 1O-Oct. 14a 16 hs\nANILLO ESTE SAN MIGUEL\nRESIDENCIAL\nDlrecclon: alcalde pedro alarcon 825\nReferenda: entregar en conserjeria\nDestinatarlo: auri orta (ORAU196987)",
    "Venta ID: 2000013363215908\nRecata esta pcnto c ia evquoiu paiu qu8 lu paquete viuja segur€ Soponte Tv Doble Brazo 32 A 85 Inchnacion Regularion 5Okg Color Negro SKU: 6097-IRM\nUnidaa\nPAULA CRISTINA MALDONADO ,1353477364 Andrea Dora 2720 Pedro Aqune Ceida, Pedio Agumie Cerd , RM (Metrppolitana) Vente: 2000013363215908 Envio; 45661117596\nEnvío Turbo Entrega: 1O-Oct. 14a 16 hs\nANILLO ESTE SANTIAGO\nRESIDENCIAL\nDirecclon: Centenario 1151\nReferenda: 716a Referencia: Edlficio nuevo en trente de la salida de metro Franklin línea 6\nDestlnatario: Nathasha Valentina Molina Peña (MOLINANATHASHA20220805142508)",
    "End\nTW\nDIRECTO\n3014700154\nRemitente:\nSCA1432\nANDREA DORIA 2720.289,753\nN-J de orden: 3014700154\nDestinatario:\nKatherine Salazar montenegro San pablo2076,701 SANTIAGO SANTIAGO",
    "CAMBIO #L4414\nNOMBRE: TRINIDAD CELIS TELÉFONO : +56 9 4342 6209 PRODUCTO: AUDIF M1O DIRECCION: PLAZA DEL RETIRO 3845 COMUNA: LO BARNECHEA\nOBSERVACION: DEJAR Y RECIBIR ANTERIOR\nLEÓN IMPORT\nLeonimport\nwww.leonimport.cl\n+56989168226"
];

for (const text of texts) {
    console.log("------------------------");
    const extracted = extractData(text);
    console.log("Extracted:", extracted.data);
    console.log("AutoApprove?", shouldAutoApprove(extracted));
}
