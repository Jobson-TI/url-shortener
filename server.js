const express = require('express')
const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS urls (
      slug TEXT PRIMARY KEY,
      original TEXT NOT NULL,
      clicks INTEGER DEFAULT 0,
      ultimoAcesso TEXT
    )
  `)
}
initDB()
 const { nanoid } = require('nanoid')

 const app = express()
 app.use(express.json())
 app.use(express.static('public'))

 app.get('/teste', (req, res) => {
    res.send('API funcionado!')
 })

 app.post('/api/encurtar', async (req, res) => {
    const { url } = req.body
    const base = `${req.protocol}://${req.get('host')}`

    if (!url) {
        return res.status(400).json({ erro: 'URL é obrigatória' })
    }

    const result = await pool.query('SELECT * FROM urls WHERE original = $1', [url])
    const existente = result.rows[0]
    if (existente) {
        return res.status(200).json({ slug: existente.slug, curta: `${base}/${existente.slug}`, original: url })
    }

    const slug = nanoid(6)
    await pool.query('INSERT INTO urls (slug, original, clicks, ultimoAcesso) VALUES ($1, $2, $3, $4)', [slug, url, 0, new Date().toISOString()])

    res.status(201).json({
        slug,
        curta: `${base}/${slug}`,
        original: url
    })
})

 app.get('/api/urls', async (req, res) => {
    const result = await pool.query('SELECT * FROM urls')
    res.json(result.rows)
})

 app.delete('/api/urls/:slug', async (req, res) => {
    await pool.query('DELETE FROM urls WHERE slug = $1', [req.params.slug])
    res.json({ mensagem: `URL ${req.params.slug} deletada com sucesso` })
})

 setInterval(async () => {
    const result = await pool.query('SELECT * FROM urls')
    const agora = new Date()
    result.rows.forEach(async url => {
        const ultimo = new Date(url.ultimoAcesso)
        const diasSemAcesso = (agora - ultimo) / (1000 * 60 * 60 * 24)
        if (diasSemAcesso >= 1) {
            await pool.query('DELETE FROM urls WHERE slug = $1', [url.slug])
        }
    })
}, 60000)

    app.get('/:slug', async (req, res) => {
        const result = await pool.query('SELECT * FROM urls WHERE slug = $1', [req.params.slug])
        const url = result.rows[0]
        if (!url) {
            return res.status(404).json({ erro: 'URL não encontrada' })
        }
        await pool.query('UPDATE urls SET clicks = $1, ultimoAcesso = $2 WHERE slug = $3', [url.clicks + 1, new Date().toISOString(), req.params.slug])
        res.redirect(url.original)
    })

 app.listen(3000, () => { //ligar na porta 3000 do servidor 
    console.log('Servidor rodando na porta 3000')
 })