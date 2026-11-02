# Peixinho Online

Jogo multiplayer em Vite + React + TypeScript + Tailwind + Firebase Firestore.

1. `npm install`
2. `copy .env.example .env`
3. Preencha `VITE_FIREBASE_*` no `.env` e ative autenticação anónima e Firestore no Firebase.
4. `npm run dev`

Para Vercel, use `npm run build`, output `dist`, e configure as mesmas variáveis de ambiente no projeto. O `vercel.json` suporta o fallback de rotas SPA. Sem Firebase configurado, a aplicação mostra uma mensagem explicativa em vez de quebrar.
