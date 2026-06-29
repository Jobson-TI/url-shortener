const express = require('express')
const Database = require('better-sqlite3')
const db = new Database('urls.db')

db.exec(`
  CREATE TABLE IF NOT EXISTS urls (
    slug TEXT PRIMARY KEY,
    original TEXT NOT NULL,
    clicks INTEGER DEFAULT 0,
    ultimoAcesso TEXT
  )
`)
 const { nanoid } = require('nanoid')

 const app = express()
 app.use(express.json())
 app.use(express.static('public'))

 app.get('/teste', (req, res) => {
    res.send('API funcionado!')
 })

 app.post('/api/encurtar', (req, res) => {
    const { url } = req.body
    const base = `${req.protocol}://${req.get('host')}`

    if (!url) {
        return res.status(400).json({ erro: 'URL é obrigatória' })
    }

    const existente = db.prepare('SELECT * FROM urls WHERE original = ?').get(url)
    if (existente) {
        return res.status(200).json({ slug: existente.slug, curta: `${base}/${existente.slug}`, original: url })
    }

    const slug = nanoid(6)
    db.prepare('INSERT INTO urls (slug, original, clicks, ultimoAcesso) VALUES (?, ?, ?, ?)').run(slug, url, 0, new Date().toISOString())

    res.status(201).json({
        slug,
        curta: `${base}/${slug}`,
        original: url
    })
})

 app.get('/api/urls', (req, res) => {
    const urls = db.prepare('SELECT * FROM urls').all()
    res.json(urls)
})

 app.delete('/api/urls/:slug', (req, res) => {
    db.prepare('DELETE FROM urls WHERE slug = ?').run(req.params.slug)
    res.json({ mensagem: `URL ${req.params.slug} deletada com sucesso` })
})

 setInterval(() => {
    const urls = db.prepare('SELECT * FROM urls').all()
    const agora = new Date()
    urls.forEach(url => {
        const ultimo = new Date(url.ultimoAcesso)
        const diasSemAcesso = (agora - ultimo) / (1000 * 60 * 60 * 24)
        if (diasSemAcesso >= 1) {
            db.prepare('DELETE FROM urls WHERE slug = ?').run(url.slug)
        }
    })
}, 60000)

    app.get('/:slug', (req, res) => {
        const url = db.prepare('SELECT * FROM urls WHERE slug = ?').get(req.params.slug)
        if (!url) {
            return res.status(404).json({ erro: 'URL não encontrada' })
        }
        db.prepare('UPDATE urls SET clicks = ?, ultimoAcesso = ? WHERE slug = ?').run(url.clicks + 1, new Date().toISOString(), req.params.slug)
        res.redirect(url.original)
    })

 app.listen(3000, () => { //ligar na porta 3000 do servidor 
    console.log('Servidor rodando na porta 3000')
 })