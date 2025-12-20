const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;

// Servir arquivos estáticos do build do React
app.use(express.static(path.join(__dirname, 'client/build')));

// Exemplo de rota de API (para expansão futura)
app.get('/api/status', (req, res) => {
  res.json({ message: "Servidor Node.js rodando perfeitamente!" });
});

// Qualquer outra requisição retorna o index.html do React
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
