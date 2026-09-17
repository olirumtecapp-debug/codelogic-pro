// api/create-pix.js - Gerador Dinâmico de Cobranças PIX Asaas para CodeLogic PRO
import https from 'https';

// A chave do Asaas vive em variavel de ambiente na Vercel (ASAAS_API_KEY).
// NUNCA grave a chave neste arquivo: o repositorio e publico e a chave gera cobrancas reais.
const ASAAS_KEY = process.env.ASAAS_API_KEY || '';

function asaasRequest(path, method = 'GET', postData = null) {
  return new Promise((resolve, reject) => {
    const payload = postData ? JSON.stringify(postData) : null;
    const options = {
      hostname: 'api.asaas.com',
      port: 443,
      path: `/v3${path}`,
      method: method,
      headers: {
        'access_token': ASAAS_KEY,
        'Content-Type': 'application/json',
        'User-Agent': 'CodeLogicPro/1.0'
      }
    };
    if (payload) {
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch(e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  if (!ASAAS_KEY) {
    return res.status(500).json({ error: 'Chave do Asaas nao configurada no servidor. Defina a variavel de ambiente ASAAS_API_KEY na Vercel.' });
  }

  try {
    const {
      itemType = 'VIP',
      itemTitle = 'Acesso VIP Vitalício',
      value = 35.99,
      studentName = 'Estudante CodeLogic PRO',
      studentEmail = 'aluno@codelogic.dev',
      trackId = null
    } = req.body || {};

    const numericVal = parseFloat(value) || 35.99;

    // 1. Localizar ou Criar Cliente no Asaas
    let customerId = null;
    try {
      const searchRes = await asaasRequest(`/customers?email=${encodeURIComponent(studentEmail)}`, 'GET');
      if (searchRes.data?.data?.length > 0) {
        customerId = searchRes.data.data[0].id;
      }
    } catch(e) {
      console.warn('Erro ao buscar cliente:', e.message);
    }

    if (!customerId) {
      const newCust = await asaasRequest('/customers', 'POST', {
        name: studentName.trim() || 'Estudante CodeLogic',
        email: studentEmail.trim() || 'aluno@codelogic.dev'
      });
      customerId = newCust.data?.id;
    }

    if (!customerId) {
      const fallbackSearch = await asaasRequest('/customers?limit=1', 'GET');
      customerId = fallbackSearch.data?.data?.[0]?.id;
    }

    if (!customerId) {
      return res.status(500).json({ error: 'Não foi possível registrar o cliente no Asaas.' });
    }

    // 2. Data de Vencimento (Hoje + 2 dias)
    const dueDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 3. Criar Cobrança PIX
    const desc = `CodeLogic PRO - ${itemTitle} (${itemType})`.slice(0, 100);
    const paymentRes = await asaasRequest('/payments', 'POST', {
      customer: customerId,
      billingType: 'PIX',
      value: numericVal,
      dueDate: dueDate,
      description: desc,
      postalService: false
    });

    if (paymentRes.status !== 200 && paymentRes.status !== 201) {
      console.error('Erro Asaas Payment:', paymentRes.data);
      return res.status(500).json({ error: 'Erro ao gerar cobrança no Asaas.', details: paymentRes.data });
    }

    const payment = paymentRes.data;

    // 4. Obter QR Code PIX e Payload Copia e Cola
    const qrRes = await asaasRequest(`/payments/${payment.id}/pixQrCode`, 'GET');
    const qrData = qrRes.data || {};

    return res.status(200).json({
      success: true,
      paymentId: payment.id,
      value: payment.value,
      itemType: itemType,
      itemTitle: itemTitle,
      trackId: trackId,
      payload: qrData.payload,
      encodedImage: qrData.encodedImage ? `data:image/png;base64,${qrData.encodedImage}` : null,
      expirationDate: qrData.expirationDate
    });

  } catch (err) {
    console.error('Fatal create-pix error:', err);
    return res.status(500).json({ error: err.message });
  }
}
