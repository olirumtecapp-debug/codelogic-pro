// /api/student/auth-help — ajuda de acesso do CodeLogic PRO
//
//   POST { action: 'enviar-codigo', email }  -> gera um codigo novo, grava no cadastro do aluno
//                                               e envia por e-mail (o aluno recupera a senha sozinho)
//   POST { action: 'ajuda', nome, emailAluno, recado } -> manda o pedido de ajuda por e-mail
//                                               para a coordenacao
//
// Os alunos do CodeLogic ficam na colecao "students" do Firestore, com id = e-mail
// sem caracteres especiais (mesmo esquema usado pelo site no navegador).
import crypto from 'crypto';
import { enviarEmail, emailConfigurado, modeloCodigo } from '../_email.js';

const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBUHGXoUMg0bV3EdmfpfmVAEYMLQceqkQc';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'expedicao-brasil';
const COLECAO = 'students';
const TIMEOUT_MS = 8000;

const basePath = '/v1/projects/' + PROJECT_ID + '/databases/(default)/documents/' + COLECAO;

function docId(email) {
    return String(email).trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

function gerarCodigo() {
    const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const numeros = '23456789';
    let codigo = '';
    for (let i = 0; i < 3; i++) codigo += letras[crypto.randomInt(0, letras.length)];
    for (let i = 0; i < 3; i++) codigo += numeros[crypto.randomInt(0, numeros.length)];
    return codigo;
}

function toValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
    if (typeof v === 'object') {
        const fields = {};
        for (const [k, x] of Object.entries(v)) { if (/[.\[\]\/~*]/.test(k)) continue; fields[k] = toValue(x); }
        return { mapValue: { fields } };
    }
    return { stringValue: String(v) };
}

async function fsRequest(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch('https://firestore.googleapis.com' + path + (path.includes('?') ? '&' : '?') + 'key=' + API_KEY, {
            ...options,
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
        });
        const texto = await res.text();
        let json = null;
        try { json = texto ? JSON.parse(texto) : null; } catch (e) { json = null; }
        return { ok: res.ok, status: res.status, body: json, raw: texto };
    } catch (err) {
        return { ok: false, status: 0, body: null, raw: String(err && err.message) };
    } finally {
        clearTimeout(timer);
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const acao = String(body.action || '').trim();
        const email = String(body.email || '').trim().toLowerCase();

        if (!emailConfigurado()) {
            return res.status(200).json({ ok: false, naoConfigurado: true, error: 'O envio de e-mail ainda não está ligado. Escreva para contato@creativeam.com.br.' });
        }

        // ---- pedido de ajuda (chega por e-mail para a coordenacao) ----
        if (acao === 'ajuda') {
            const nome = String(body.nome || '').trim() || 'Aluno';
            const emailAluno = String(body.emailAluno || email || '').trim().toLowerCase();
            const recado = String(body.recado || '').trim();
            if (!recado) return res.status(400).json({ ok: false, error: 'Escreva o que aconteceu.' });

            const destino = process.env.EMAIL_RESPOSTA || 'contato@creativeam.com.br';
            const texto = [
                'Pedido de ajuda para entrar no CodeLogic PRO',
                '',
                'Nome: ' + nome,
                'E-mail do aluno: ' + emailAluno,
                'Conta na plataforma: ' + (email || '(não informada)'),
                '',
                'Recado:',
                recado
            ].join('\n');

            const envio = await enviarEmail({ para: destino, assunto: 'CodeLogic - ajuda para entrar (' + nome + ')', texto: texto });
            if (!envio.ok) return res.status(200).json({ ok: false, error: 'Não foi possível enviar agora. Escreva para contato@creativeam.com.br.' });

            return res.status(200).json({ ok: true, message: 'Pedido enviado! A coordenação responde para o e-mail que você deixou.' });
        }

        // ---- enviar codigo de recuperacao por e-mail ----
        if (acao === 'enviar-codigo') {
            if (!email || !email.includes('@')) return res.status(400).json({ ok: false, error: 'Informe um e-mail válido.' });

            const r = await fsRequest(basePath + '/' + docId(email));
            if (r.status === 404) {
                return res.status(200).json({ ok: false, semMatricula: true, success: false, error: 'Não encontrei matrícula com este e-mail. Confira o endereço ou use a opção de falar com a coordenação.' });
            }
            if (!r.ok || !r.body || !r.body.fields) {
                return res.status(200).json({ ok: false, error: 'Não foi possível consultar o cadastro agora.' });
            }

            const codigo = gerarCodigo();
            const agora = new Date().toISOString();
            // o site do CodeLogic guarda a senha no proprio cadastro, entao o codigo segue o mesmo formato dele
            const patch = await fsRequest(basePath + '/' + docId(email) + '?updateMask.fieldPaths=recoveryCode&updateMask.fieldPaths=recoveryCodeCreatedAt', {
                method: 'PATCH',
                body: JSON.stringify({ fields: { recoveryCode: toValue(codigo), recoveryCodeCreatedAt: toValue(agora) } })
            });
            if (!patch.ok) return res.status(200).json({ ok: false, error: 'Falha ao gerar o código.' });

            const nomeAluno = r.body.fields && r.body.fields.name && r.body.fields.name.stringValue;
            const modelo = modeloCodigo({ nome: nomeAluno, codigo: codigo, plataforma: 'CodeLogic PRO' });
            const envio = await enviarEmail({ para: email, assunto: modelo.titulo + ' - CodeLogic PRO', texto: modelo.texto, html: modelo.html });
            if (!envio.ok) return res.status(200).json({ ok: false, error: envio.error || 'Não foi possível enviar o e-mail agora.' });

            return res.status(200).json({ ok: true, message: 'Código enviado para ' + email + '. Confira a caixa de entrada (e o spam).' });
        }

        return res.status(400).json({ ok: false, error: 'Ação inválida: ' + acao });
    } catch (err) {
        return res.status(500).json({ ok: false, error: 'Erro no servidor: ' + err.message });
    }
}
