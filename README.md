# Farmácia São Carlos - Cristi (site)

## Arquivos importantes

| Arquivo | Vai para o GitHub? | Função |
|---------|--------------------|--------|
| `index.html` | Sim | Site completo |
| `config.example.js` | Sim | Modelo sem segredos |
| `config.js` | **NÃO** | Chaves reais (admin + JSONBin) |
| `.gitignore` | Sim | Impede commit de `config.js` |

## Como usar no seu computador

1. Baixe/clone a pasta do projeto
2. Copie a configuração:
   ```bash
   cp config.example.js config.js
   ```
3. Abra `config.js` e preencha:
   - `ADMIN_CODE` — código para entrar no admin (busca do site)
   - `BIN_ID` — ID do seu Bin no JSONBin
   - `API_KEY` — Master Key do JSONBin
4. Abra `index.html` no navegador  
   (ou use um servidor local: `npx serve .`)

## Como publicar no GitHub com mais segurança

1. Crie o repositório (**preferível privado**)
2. Confirme que `config.js` **não** está sendo commitado:
   ```bash
   git status
   ```
   Se `config.js` aparecer, **não** dê `git add config.js`
3. Envie só o HTML + `config.example.js` + `.gitignore` + este README
4. **Troque a Master Key** no JSONBin se ela já vazou (chat, e-mail, repo antigo)
5. Atualize o `config.js` local com a chave nova

### Importante (leia)

Mesmo com `config.js` fora do Git:

- Se você hospedar o site em **GitHub Pages / Netlify / Vercel estático** e fizer upload do `config.js`, **visitantes ainda veem as chaves** no DevTools (F12).
- Isso é limitação de site 100% front-end.
- Segurança de verdade exige **backend** (servidor) onde a Master Key nunca vai para o navegador.

Para uso interno / testes / PC da farmácia, separar `config.js` já evita vazar a chave no histórico do Git.

## JSONBin

Cole no Bin o JSON completo (products + settings + leads + orders…), conforme orientado nas conversas do projeto.

## Admin

Digite o `ADMIN_CODE` no campo de busca do site e pressione Enter.

## Checklist rápido

- [ ] `config.js` criado e preenchido
- [ ] `config.js` no `.gitignore`
- [ ] Bin com JSON completo
- [ ] Master Key rotacionada se já foi exposta
- [ ] Repo GitHub privado (recomendado)
- [ ] Testou salvar produto e abrir admin
