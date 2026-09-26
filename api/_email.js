// lib/_email.js — envio de e-mail transacional e recuperação de acesso
//
// Prioridade 1: Envio direto via Gmail SMTP oficial (100% gratuito, sem intermediários, sem expirar)
// Prioridade 2: Fallback para Resend se as credenciais do Gmail não estiverem presentes
import nodemailer from 'nodemailer';

const GMAIL_USER = process.env.GMAIL_USER || 'contatocreativeam@gmail.com';
const GMAIL_PASS = process.env.GMAIL_PASS || 'kdepmqzpwvqwgcuo';

let _transporter = null;
function getTransporter() {
    if (!_transporter && GMAIL_USER && GMAIL_PASS) {
        _transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: GMAIL_USER,
                pass: GMAIL_PASS
            }
        });
    }
    return _transporter;
}

export function emailConfigurado() {
    return !!(GMAIL_USER && GMAIL_PASS) || !!(process.env.RESEND_API_KEY && process.env.EMAIL_REMETENTE);
}

export async function enviarEmail({ para, assunto, texto, html }) {
    if (!para || !String(para).includes('@')) {
        return { ok: false, error: 'Destinatário inválido.' };
    }

    // 1. Envio Direto via Gmail Oficial
    const transporter = getTransporter();
    if (transporter) {
        try {
            const remetente = process.env.EMAIL_REMETENTE_NOME 
                ? `"${process.env.EMAIL_REMETENTE_NOME}" <${GMAIL_USER}>`
                : `"CreativeAM Suporte" <${GMAIL_USER}>`;

            const info = await transporter.sendMail({
                from: remetente,
                to: para,
                subject: assunto || 'CreativeAM',
                replyTo: GMAIL_USER,
                text: texto || '',
                html: html || undefined
            });

            console.log('[email-gmail] enviado com sucesso para', para, 'ID:', info.messageId);
            return { ok: true, id: info.messageId };
        } catch (err) {
            console.error('[email-gmail] falha no envio via Gmail:', err && err.message);
        }
    }

    // 2. Fallback via Resend se configurado
    const chave = process.env.RESEND_API_KEY;
    const remetente = process.env.EMAIL_REMETENTE;
    if (chave && remetente) {
        try {
            const resposta = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + chave,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: remetente,
                    to: [para],
                    subject: assunto || 'CreativeAM',
                    reply_to: GMAIL_USER,
                    text: texto || '',
                    html: html || undefined
                })
            });

            const corpo = await resposta.text();
            if (resposta.ok) {
                return { ok: true, id: (() => { try { return JSON.parse(corpo).id; } catch (e) { return null; } })() };
            }
        } catch (err) {
            console.error('[email-resend] falha no fallback Resend:', err && err.message);
        }
    }

    return { ok: false, error: 'Não foi possível enviar o e-mail no momento.' };
}

export function modeloCodigo({ nome, codigo, plataforma }) {
    const titulo = 'Seu código de recuperação';
    const texto = [
        'Olá' + (nome ? ', ' + nome : '') + '!',
        '',
        'Você pediu para recuperar o acesso à ' + (plataforma || 'nossa plataforma') + '.',
        'Seu código é: ' + codigo,
        '',
        'Entre no site, clique em "recuperar meu progresso" e informe este código.',
        'Se não foi você que pediu, ignore este e-mail — nada muda na sua conta.',
        '',
        'CreativeAM — Ideias que ganham vida'
    ].join('\n');

    const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">' +
        '<h2 style="margin:0 0 8px;color:#1e3a8a">' + titulo + '</h2>' +
        '<p style="color:#475569;margin:0 0 16px">Olá' + (nome ? ', ' + nome : '') + '! Você pediu para recuperar o acesso à ' + (plataforma || 'nossa plataforma') + '.</p>' +
        '<p style="font-size:32px;font-weight:bold;letter-spacing:6px;background:#f8fafc;border:2px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center;margin:0 0 16px;color:#2563eb">' + codigo + '</p>' +
        '<p style="color:#475569;margin:0 0 8px">Entre no site, clique em <strong>recuperar meu progresso</strong> e informe este código.</p>' +
        '<p style="color:#94a3b8;font-size:12px;margin:16px 0 0">Se não foi você que pediu, ignore este e-mail — nada muda na sua conta.</p>' +
        '</div>';

    return { titulo, texto, html };
}
