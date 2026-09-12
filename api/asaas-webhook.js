// api/asaas-webhook.js - Webhook Oficial do Asaas para CODELOGIC PRO
let recentApprovals = globalThis.__codelogic_approvals || [];
globalThis.__codelogic_approvals = recentApprovals;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Content-Type, asaas-access-token');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 1. Consulta do frontend do CodeLogic PRO (GET) para verificar se o PIX foi pago
  if (req.method === 'GET') {
    const { paymentId, value } = req.query || {};
    const now = Date.now();
    
    // Procura aprovacao recente (ultimos 20 minutos)
    const match = recentApprovals.find(item => {
      const isFresh = (now - item.timestamp) < 20 * 60 * 1000;
      if (!isFresh) return false;
      if (paymentId && item.paymentId === paymentId) return true;
      if (value && Math.abs(parseFloat(item.value) - parseFloat(value)) < 0.05) return true;
      return false;
    });

    if (match) {
      return res.status(200).json({
        approved: true,
        event: match.event,
        paymentId: match.paymentId,
        value: match.value,
        timestamp: match.timestamp
      });
    }

    return res.status(200).json({ approved: false, message: 'Aguardando confirmacao do Asaas' });
  }

  // 2. Notificacao oficial enviada pelo Asaas (POST)
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const event = body.event;
      const payment = body.payment || {};

      console.log(`[Asaas CodeLogic Webhook] Evento: ${event}, ID: ${payment.id}, Valor: ${payment.value}`);

      const isApprovedEvent = [
        'PAYMENT_RECEIVED',
        'PAYMENT_CONFIRMED',
        'PAYMENT_RECEIVED_IN_CASH'
      ].includes(event);

      if (isApprovedEvent && payment.id) {
        const approvalRecord = {
          paymentId: payment.id,
          event: event,
          value: payment.value,
          billingType: payment.billingType,
          timestamp: Date.now()
        };

        recentApprovals = recentApprovals.filter(a => a.paymentId !== payment.id);
        recentApprovals.unshift(approvalRecord);
        if (recentApprovals.length > 50) recentApprovals.pop();
        globalThis.__codelogic_approvals = recentApprovals;
      }

      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('[Asaas CodeLogic Webhook] Erro:', err);
      return res.status(200).json({ received: true, error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
