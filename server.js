const express = require('express')//importado o express que foi instalador
const { Pool } = require('pg')//importado o banco de dados
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const jwt = require('jsonwebtoken')//token de acesso importado
const JWT_SECRET = process.env.JWT_SECRET || 'chave-secreta-local' 
const bcrypt = require('bcrypt')

async function initDB() {
  //tabela do encurtador
  await pool.query(`
    CREATE TABLE IF NOT EXISTS urls (
      slug TEXT PRIMARY KEY,
      original TEXT NOT NULL,
      clicks INTEGER DEFAULT 0,
      ultimoAcesso TEXT
    )
  `)
  //tabela de usuario
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL
    )
 `)
 await pool.query(`ALTER TABLE urls ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id)`)
 await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nome TEXT`)
 await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS criadoEm TEXT`)
 await pool.query(`ALTER TABLE urls ADD COLUMN IF NOT EXISTS criadoem TEXT`)
}
initDB()
 const { nanoid } = require('nanoid')

 const app = express()
 app.use(express.json())//transformar os textos em json
 app.use(express.static('public'))//usado esse script na pasta public

 app.get('/teste', (req, res) => {
    res.send('API funcionado!')
 })

 //o encurtado do site aqui ele transformar o link em curto
 app.post('/api/encurtar', autenticarOpcional, async (req, res) => {
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

    const slugPersonalizado = req.body.slug
    let slug

    if (slugPersonalizado) {
        if (slugPersonalizado.length < 3 || slugPersonalizado.length > 20) {
            return res.status(400).json({ erro: 'Slug deve ter entre 3 e 20 caracteres' })
        }
        const jaExiste = await pool.query('SELECT slug FROM urls WHERE slug = $1', [slugPersonalizado])
        if (jaExiste.rows[0]) {
            return res.status(400).json({ erro: 'Esse slug já existe, tente outro' })
        }
        slug = slugPersonalizado
    } else {
        slug = nanoid(6)
    }

    await pool.query('INSERT INTO urls (slug, original, clicks, ultimoAcesso, usuario_id, criadoem) VALUES ($1, $2, $3, $4, $5, $6)', [slug, url, 0, new Date().toISOString(), req.usuarioId, new Date().toISOString()])

    res.status(201).json({
        slug,
        curta: `${base}/${slug}`,
        original: url
    })
})

//cadastro
 app.post('/api/cadastro', async (req, res) => {
    const { email, senha, nome } = req.body

    if (!email || !senha || !nome) {
        return res.status(400).json({ erro: 'Nome, email e senha obrigatórios'})
    }

    const hash = await bcrypt.hash(senha, 10)
    const resultado = await pool.query('INSERT INTO usuarios (email, senha, nome, criadoEm) VALUES ($1, $2, $3, $4) RETURNING id', [email, hash, nome, new Date().toISOString()])
    const token = jwt.sign({ id: resultado.rows[0].id }, JWT_SECRET, { expiresIn: '7d' })
    res.status(201).json({ token, nome })
})

//autentiação opcional
function autenticarOpcional(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET)
            req.usuarioId = decoded.id
        } catch {}
    }
    next()
}

//verificado de token
 function autenticar(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
        return res.status(401).json({ erro: 'Token não fornecido' })
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET)
        req.usuarioId = decoded.id
        next()   
    } catch {
        return res.status(401).json({ erro: 'Token inválido' })
    }
 }

//login
 app.post('/api/login', async (req, res) => {
    const { email, senha } = req.body
    const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email])
    const usuario = result.rows[0]

    if (!usuario) {
        return res.status(400).json({ erro: 'Email não cadastrado'})
    }

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha)

    if (!senhaCorreta) {
        return res.status(400).json({ erro: 'Senha incorreta'})
    }

    const token = jwt.sign({ id: usuario.id }, JWT_SECRET, {expiresIn: '7d'})
    res.json({ token, nome: usuario.nome })
 })
//mostrar todas as urls
 app.get('/api/urls', autenticar, async (req, res) => {
    const result = await pool.query('SELECT * FROM urls WHERE usuario_id = $1', [req.usuarioId])
    res.json(result.rows)
})
//deletar as urls
 app.delete('/api/urls/:slug', autenticar, async (req, res) => {
    await pool.query('DELETE FROM urls WHERE slug = $1', [req.params.slug])
    res.json({ mensagem: `URL ${req.params.slug} deletada com sucesso` })
})
//temporizado para deletar url depois de um tempo
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

//o redirecionador do encurtador para o site real
    app.get('/:slug', async (req, res) => {
        const result = await pool.query('SELECT * FROM urls WHERE slug = $1', [req.params.slug])
        const url = result.rows[0]
        if (!url) {
            return res.status(404).sendFile('404.html', { root: 'public' })
        }
        await pool.query('UPDATE urls SET clicks = $1, ultimoAcesso = $2 WHERE slug = $3', [url.clicks + 1, new Date().toISOString(), req.params.slug])
        res.redirect(url.original)
    })

 app.listen(3000, () => { //ligar na porta 3000 do servidor 
    console.log('Servidor rodando na porta 3000')
 })