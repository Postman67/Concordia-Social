<div align="center">
  <img src="branding/Hero - GitHub.svg" alt="Concordia — Talk free" width="860" />
  <br /><br />
  <a href="https://github.com/Postman67/Concordia-Federation">Federation</a> ·
  <a href="https://github.com/Postman67/Concordia-Client">Client</a> ·
  <a href="https://github.com/Postman67/Concordia-Server">Server</a>
</div>

---

## What is Concordia?

Concordia is a decentralised, real-time chat and social platform — conceptually similar to Discord, but built around a philosophy of ownership, openness, and sovereignty. No single company controls the network.

## Features

| | |
|---|---|
| 🔑 **Global identity** | Register one username on the federation. It works across every server on the network — no duplicate accounts, no vendor lock-in. |
| 🖥️ **Real servers** | Servers are actual hardware — bare metal or virtualised. Self-host at home, deploy to a VPS, or use any cloud provider. |
| 🌐 **Federated by design** | Servers talk directly to each other. Share emotes, messages, and channels across instances with no central authority in between. |
| 🗄️ **You control your data** | Every byte lives on the server the owner chooses. Full message history, large file uploads, and unlimited custom emotes — stored exactly where you decide. |
| 🔓 **No gatekeepers** | No single company owns the network. Any server can join or leave freely, and the communities you build always belong to you. |
| 📖 **Fully open source** | Every line of code is public. Audit it, fork it, self-host it, or contribute — Concordia has nothing to hide. |

## Repositories

| Repo | Description |
|---|---|
| [**Concordia**](https://github.com/Postman67/Concordia) | This repo — marketing frontend (`concordiachat.com`) |
| [**Concordia-Federation**](https://github.com/Postman67/Concordia-Federation) | Global identity & server registry — handles usernames, server discovery, and cross-instance trust |
| [**Concordia-Client**](https://github.com/Postman67/Concordia-Client) | The user-facing chat application (`app.concordiachat.com`) |
| [**Concordia-Server**](https://github.com/Postman67/Concordia-Server) | The self-hostable server software — channels, messages, and federation protocol |

## This repository

This is the **marketing frontend** — a static React site served at `concordiachat.com`. It explains what Concordia is and links users to the client app. It contains no user authentication; login and account management live in the Client.

### Stack

- [Vite](https://vitejs.dev/) + [React 18](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Express](https://expressjs.com/) for production static serving (Railway-compatible)

### Development

```bash
cd frontend
npm install
npm run dev        # dev server → http://localhost:5173
```

### Production

```bash
npm run build      # outputs to dist/
npm run start      # serves dist/ via Express
```

### Deployment

Configured for [Railway](https://railway.app/) via `railway.json`. Set `PORT` in the Railway environment variables panel (Railway also sets this automatically).
