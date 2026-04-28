# SurgiFlow

Sistema web em HTML, CSS e JavaScript puro para agendamento, acompanhamento de cirurgias, anexos, permissões e auditoria.

## Estrutura

- `index.html`: login com Google via Firebase Auth, seguindo o fluxo de acesso usado como referência em JD Ferragens.
- `cadastro-usuario.html`: cadastro público com Google, status pendente e liberação posterior por administrador.
- `app.html`: SPA protegida.
- `pages/`: telas carregadas dinamicamente.
- `js/firebase-config.js`: única fonte de configuração Firebase e exports `app`, `auth` e `db`.
- `js/services/`: Auth, logs, permissões, índices, anexos e Cloudinary.
- `netlify/functions/cloudinary-move-to-deleted.js`: função segura para mover anexos excluídos no Cloudinary.

## Firebase

O projeto usa Firebase v9 modular e Realtime Database. A configuração fica apenas em `js/firebase-config.js`.

Nos principais esperados no Realtime Database:

```txt
pacientes/
medicos/
hospitais/
convenios/
materiais/
tipos_cirurgias/
cirurgias/
pos_cirurgico/
usuarios/
permissoes_pacientes/
logs/
arquivos_excluidos/
consultas_por_medico/
consultas_por_paciente/
```

O cadastro público grava uma solicitação em `usuarios/{uid}` e `login/{uid}` com `status: "pendente"`. Para liberar o acesso, um administrador deve alterar o status para `ativo` e confirmar o `nivelAcesso`.

Exemplo de usuário ativo:

```json
{
  "nome": "Nome do usuário",
  "email": "email@clinica.com",
  "nivelAcesso": 1,
  "medicoId": "m_exemplo",
  "status": "ativo"
}
```

Níveis sugeridos: `1` administrador geral, `2` administrador da clínica, `3` médico, `4` secretária, `5` financeiro, `6` hospital, `7` paciente, `8` somente leitura.

## Cloudinary

Uploads são feitos pelo front-end usando unsigned upload. Para testar os anexos enquanto a função segura da Netlify ainda não estiver pronta, configure em `js/cloudinary-config.js` somente:

```js
cloudName
uploadPreset
```

Não coloque API Secret no front-end.

Pastas usadas:

- Anexos gerais: `cirurgias/{cirurgiaId}/anexos/{nomeArquivo}`
- Anexos de gastos: `cirurgias/{cirurgiaId}/gastos/{nomeArquivo}`
- Excluídos gerais: `excluidos/cirurgias/{cirurgiaId}/anexos/{nomeArquivo}`
- Excluídos de gastos: `excluidos/cirurgias/{cirurgiaId}/gastos/{nomeArquivo}`

## Netlify

O `netlify.toml` já aponta as functions:

```toml
[functions]
  directory = "netlify/functions"
```

Cadastre as variáveis em `Site settings > Environment variables`:

```txt
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

A função `cloudinary-move-to-deleted` serve apenas para mover arquivos para `excluidos/`. Uploads continuam no front-end por unsigned preset.

## Índices de consulta rápida

Ao criar cirurgia, o sistema grava em uma operação multi-location update:

```txt
cirurgias/{cirurgiaId}
consultas_por_medico/{medicoId}/{cirurgiaId}: true
consultas_por_paciente/{pacienteId}/{cirurgiaId}: true
```

Os índices guardam apenas IDs e valor `true`; dados completos ficam em `cirurgias/{cirurgiaId}`.

## Desenvolvimento local

Instale dependências quando for usar Netlify Functions:

```bash
npm install
npm run dev
```

Para testar apenas as telas estáticas, sirva a pasta com qualquer servidor local. Como os módulos usam imports ES e `fetch`, evite abrir o HTML direto pelo arquivo.
