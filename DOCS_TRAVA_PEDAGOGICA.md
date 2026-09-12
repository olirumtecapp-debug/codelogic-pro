# 🛡️ Arquitetura da Trava Pedagógica Anti-Fraude (Pedagogical Lock)
### *Guia Oficial de Especificação, Implementação & Reutilização para Cursos EAD*

Este documento serve como especificação técnica e padrão arquitetural para o **CodeLogic PRO** e para **qualquer nova plataforma educacional ou curso EAD futuro**.

---

## 🎯 1. Objetivo da Trava Pedagógica
Em plataformas de ensino aberto e cursos online, é comum estudantes tentarem avançar rapidamente pelas aulas clicando em *"Avançar"* em poucos segundos sem ler o conteúdo, visando apenas emitir o certificado de conclusão.

A **Trava Pedagógica (Pedagogical Lock)** foi desenvolvida para:
1. **Garantir a leitura e reflexão**: O aluno precisa obrigatoriamente interagir com um desafio prático de código para desbloquear a próxima aula.
2. **Valorizar o Certificado Oficial**: Certificados emitidos pela plataforma têm credibilidade comprovada, pois o aluno precisou atingir pelo menos 70% de acerto nas avaliações.
3. **Preservar a usabilidade na revisão**: O estudante que já concluiu a aula anteriormente pode navegar livremente para frente e para trás para consultar o material sem bloqueios.

---

## 🏗️ 2. Os 4 Pilares da Arquitetura

```
[ AULA CARREGADA ]
       │
       ▼
[ Já foi lida antes? ] ───( SIM )───► [ Botão Avançar LIBERADO ]
       │
     ( NÃO )
       │
       ▼
[ Botão Avançar TRAVADO: "🔒 Responda o Desafio" ]
       │
       ▼
[ Aluno clica em uma alternativa do Mini-Desafio ]
       │
       ▼
[ Dispara checkMiniGameOption() ]
       │
       ├─► Exibe Feedback com Explicação Técnica
       ├─► Credita Moedas/XP Dev
       └─► Desbloqueia Botão: "Próxima Aula Desbloqueada! →" (Verde Esmeralda)
```

---

## ⚙️ 3. Como Acionar e Configurar no Sistema

A trava é **ativada automaticamente** pelo motor do CodeLogic para qualquer aula que possua a propriedade `miniGame` cadastrada em seu JSON.

### Chave Global de Configuração (Ligar/Desligar):
Caso o instrutor queira desativar ou reativar a trava temporariamente (por exemplo, para demonstrações rápidas para parceiros), existe a chave global:

```javascript
// Ativar ou desativar a trava globalmente
window.PEDAGOGICAL_LOCK_ENABLED = true; // true = Ativa (padrão) | false = Desativada
```

---

## 📝 4. Como Estruturar uma Nova Aula Compatível

Para que qualquer nova aula em novos cursos utilize a trava automaticamente, basta incluir o objeto `miniGame` no JSON da aula:

```json
{
  "title": "1. O que são Variáveis e Espaços em Memória 📦",
  "content": "Texto detalhado da aula com códigos e exemplos práticos...",
  "miniGame": {
    "question": "Qual é a principal função de uma variável na programação?",
    "options": [
      "Armazenar e rotular dados temporariamente na memória RAM.",
      "Aumentar a velocidade física da placa de vídeo do computador.",
      "Impedir que o código seja copiado por outros usuários.",
      "Desligar o monitor quando o programa terminar de rodar."
    ],
    "correct": 0,
    "explanation": "Variáveis funcionam como gavetas etiquetadas na memória RAM onde guardamos valores para uso durante a execução."
  }
}
```

> **Regra:** Se a aula possuir `miniGame`, o motor do curso bloqueia o botão de avanço até que o aluno selecione uma das alternativas.

---

## 💻 5. Código-Fonte Universal (Plug & Play para Próximos Projetos)

Abaixo está o módulo isolado em JavaScript que pode ser copiado diretamente para qualquer outro projeto (React, Vue, Node ou HTML puro):

```javascript
/**
 * PEDAGOGICAL LOCK MODULE (TRAVA PEDAGÓGICA)
 * Reutilizável em qualquer plataforma educacional
 */
const PedagogicalLock = {
    enabled: true,
    currentLessonUnlocked: false,

    // 1. Inicializa o estado ao carregar uma nova aula
    onLessonLoad: function(studentProgress, lessonIndex) {
        // Se a aula já foi concluída no histórico do aluno, libera a navegação
        const alreadyCompleted = (studentProgress.completedLessons || 0) > lessonIndex;
        this.currentLessonUnlocked = !this.enabled || alreadyCompleted;

        this.updateNextButtonUI(alreadyCompleted);
    },

    // 2. Chamado quando o aluno clica em uma alternativa do desafio
    onChallengeAnswered: function(selectedIndex, correctIndex) {
        this.currentLessonUnlocked = true;

        const nextBtn = document.getElementById('btn-next-lesson');
        const nextText = document.getElementById('btn-next-lesson-text');
        
        if (nextBtn) {
            nextBtn.className = "btn-unlocked bg-emerald-500 text-slate-950 font-bold animate-pulse";
        }
        if (nextText) {
            nextText.innerText = "Próxima Aula Desbloqueada! →";
        }
    },

    // 3. Intercepta o clique no botão "Avançar"
    handleNextClick: function(advanceCallback) {
        if (!this.currentLessonUnlocked) {
            alert("🎯 Desafio Obrigatório!\n\nPara garantir seu aprendizado e liberar a próxima aula, selecione uma resposta no desafio prático logo acima.");
            const challengeEl = document.getElementById('lesson-challenge-box');
            if (challengeEl) {
                challengeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return false;
        }

        // Executa o avanço de aula
        advanceCallback();
        return true;
    },

    // 4. Atualiza a aparência do botão de avanço
    updateNextButtonUI: function(isAlreadyCompleted) {
        const nextBtn = document.getElementById('btn-next-lesson');
        const nextText = document.getElementById('btn-next-lesson-text');
        
        if (nextBtn && nextText) {
            if (isAlreadyCompleted || !this.enabled) {
                nextBtn.className = "btn-free bg-sky-500 text-slate-950 font-bold";
                nextText.innerText = "Próxima Aula →";
            } else {
                nextBtn.className = "btn-locked bg-slate-800 text-slate-400 border border-slate-700";
                nextText.innerText = "🔒 Responda o Desafio para Avançar";
            }
        }
    }
};
```

---

## 🏆 6. Critério de Certificação Oficial
Para complementar a trava de aula por aula, a emissão de certificados segue a **Regra dos 70%**:

- **Fórmula de Aproveitamento:**
  $$\text{Aproveitamento (\%)} = \left( \frac{\text{Acertos no Quiz Final}}{\text{Total de Questões}} \right) \times 100$$
- **Resultado $\ge 70\%$**: Certificado emitido com sucesso, selo de autenticidade registrado no Firestore e medalha de conclusão concedida.
- **Resultado $< 70\%$**: O sistema bloqueia a certificação, exibe a nota obtida e orienta o aluno a revisar as aulas do módulo antes de refazer a prova.

---

## 📌 Onde este documento está localizado:
- Arquivo oficial no repositório: `D:\ProjetosGITHUB\codelogic-pro\DOCS_TRAVA_PEDAGOGICA.md`
- Disponível no GitHub: `https://github.com/olirumtecapp-debug/codelogic-pro/blob/main/DOCS_TRAVA_PEDAGOGICA.md`
