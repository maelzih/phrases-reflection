# claude-quotes

Coleta frases de **filosofia** e **estudo** da internet, traduz automaticamente para **português (pt-BR)** e gera um arquivo [`quotes.json`](./quotes.json) pronto para ser consumido por uma _statusline_ do Claude Code (painel "Frase da hora").

- ✅ Sem dependências (usa o `fetch` nativo do Node 18+)
- ✅ Múltiplas fontes ([Quotable](https://github.com/lukePeavey/quotable) por tags + [Stoic Quotes](https://stoic-quotes.com/))
- ✅ Tradução EN→PT-BR com fallback (Google `translate_a` → MyMemory)
- ✅ Atualização automática diária via **GitHub Actions**

## Formato gerado

```json
[
  { "text": "A persistência é o caminho do êxito.", "author": "Charles Chaplin", "tags": ["wisdom"] }
]
```

A statusline aceita esse formato direto (campos `text` e `author`; `tags` é opcional/ignorado).

## Uso local

```bash
node src/fetch-quotes.js
# gera/atualiza quotes.json na raiz
```

Variáveis de ambiente opcionais:

| Variável         | Padrão | Descrição                              |
| ---------------- | ------ | -------------------------------------- |
| `QUOTES_TARGET`  | `120`  | Quantas frases gerar                   |
| `QUOTES_MAXLEN`  | `160`  | Tamanho máximo (caracteres) de cada frase |

## Publicar no GitHub

```bash
cd claude-quotes
git init
git add .
git commit -m "feat: gerador de frases pt-BR de filosofia e estudo"
git branch -M main
git remote add origin https://github.com/maelzih/phrases-reflection.git
git push -u origin main
```

Depois, em **Settings → Actions → General → Workflow permissions**, marque
**"Read and write permissions"** para o Action conseguir commitar o `quotes.json`
atualizado. O workflow roda todo dia às 06:00 UTC e também pode ser disparado
manualmente em **Actions → Atualizar frases → Run workflow**.

## Conectar à statusline

Copie a URL **raw** do `quotes.json`:

```
https://raw.githubusercontent.com/maelzih/phrases-reflection/main/quotes.json
```

E cole na constante `QUOTES_URL` do seu `~/.claude/statusline.js`:

```js
const QUOTES_URL = 'https://raw.githubusercontent.com/maelzih/phrases-reflection/main/quotes.json';
```

A statusline baixa as frases em segundo plano, guarda em cache por algumas horas
e troca a "Frase da hora" a cada hora cheia.

## Licença

[MIT](./LICENSE)
