// api/asaas-webhook.js — Webhook do Asaas para CODELOGIC PRO (ESM)
//
// A aprovacao vai para o Firestore (nao mais para a memoria do processo): em serverless
// cada chamada pode cair em outra instancia e o site nunca veria o pagamento.
import { registrarPagamento, listarPagamentos, limparPagamentosAntigos } from './_pagamentos.js';
import crypto from 'crypto';

// Concede o VIP no cadastro do aluno (colecao students) para o e-mail que pagou
async function concederVipNoServidor(email) {
  if (!email || !String(email).includes('@')) return false;
  const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBUHGXoUMg0bV3EdmfpfmVAEYMLQceqkQc';
  const PROJ = 'expedicao-brasil';
  const id = String(email).trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  const base = 'https://firestore.googleapis.com/v1/projects/' + PROJ + '/databases/(default)/documents/students/' + id;
  try {
    const atual = await fetch(base + '?key=' + API_KEY);
    if (atual.status === 404) return false;
    const patch = await fetch(base + '?updateMask.fieldPaths=isVip&updateMask.fieldPaths=vipDesde&key=' + API_KEY, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { isVip: { booleanValue: true }, vipDesde: { stringValue: new Date().toISOString() } } })
    });
    return patch.ok;
  } catch (e) { return false; }
}

const EVENTOS_APROVADOS = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED_IN_CASH'];
const JANELA_MS = 15 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, asaas-access-token');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    const { value, since } = req.query || {};
    const desde = parseInt(since || '0', 10) || 0;
    const pagamentos = await listarPagamentos();
    const agora = Date.now();
    const achou = pagamentos.find(p => {
      if (desde && Number(p.timestamp) < desde) return false;
      if ((agora - Number(p.timestamp)) >= JANELA_MS) return false;
      if (value) return Math.abs(parseFloat(p.value) - parseFloat(value)) < 0.1;
      return true;
    });
    if (achou) return res.status(200).json({ approved: true, event: achou.event, paymentId: achou.paymentId, value: achou.value, timestamp: achou.timestamp });
    return res.status(200).json({ approved: false, message: 'Aguardando confirmação do Asaas' });
  }

  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const event = body.event;
      const payment = body.payment || {};
      if (EVENTOS_APROVADOS.includes(event)) {
        const registro = {
          paymentId: payment.id || null,
          event: event,
          value: payment.value || null,
          billingType: payment.billingType || null,
          customerEmail: (payment.customer && payment.customer.email) || null,
          timestamp: Date.now()
        };
        await registrarPagamento(registro);
        await limparPagamentosAntigos();
        console.log('[Asaas] pagamento confirmado: ' + registro.paymentId + ' | ' + registro.customerEmail);
        if (registro.customerEmail) {
          concederVipNoServidor(registro.customerEmail).then(ok => console.log('[Asaas] VIP concedido para ' + registro.customerEmail + ': ' + ok));
        }
      }
      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('[Asaas] erro:', err && err.message);
      return res.status(200).json({ received: true, error: err && err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
