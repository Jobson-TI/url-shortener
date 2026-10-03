require('dotenv').config()
const express = require('express')//importado o express que foi instalador
const path = require('path')
const { DatabaseSync } = require('node:sqlite')//banco embutido no Node, sem precisar compilar nada
const jwt = require('jsonwebtoken')//token de acesso importado
const JWT_SECRET = process.env.JWT_SECRET || 'chave-secreta-local'
const bcrypt = require('bcryptjs')

const db = new DatabaseSync(path.join(__dirname, 'database.sqlite'))

// pequenos helpers pra não ficar repetindo db.prepare(...) toda hora
function run(sql, params = []) { return db.prepare(sql).run(...params) }
function get(sql, params = []) { return db.prepare(sql).get(...params) }
function all(sql, params = []) { return db.prepare(sql).all(...params) }

// SQLite não tem "ALTER TABLE ... ADD COLUMN IF NOT EXISTS" como o Postgres,
// então checamos manualmente se a coluna já existe antes de adicionar.
function addColumnIfNotExists(table, column, definition) {
  const columns = all(`PRAGMA table_info(${table})`)
  const existe = columns.some((c) => c.name === column)
  if (!existe) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

function initDB() {
  //tabela do encurtador
  db.exec(`
    CREATE TABLE IF NOT EXISTS urls (
      slug TEXT PRIMARY KEY,
      original TEXT NOT NULL,
      clicks INTEGER DEFAULT 0,
      ultimoacesso TEXT
    )
  `)
  //tabela de usuario
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL
    )
  `)
  addColumnIfNotExists('urls', 'usuario_id', 'INTEGER REFERENCES usuarios(id)')
  addColumnIfNotExists('usuarios', 'nome', 'TEXT')
  addColumnIfNotExists('usuarios', 'criadoem', 'TEXT')
  addColumnIfNotExists('urls', 'criadoem', 'TEXT')
  limparURLsAntigas()
}

function limparURLsAntigas() {
  const urls = all('SELECT * FROM urls')
  const agora = new Date()
  urls.forEach((url) => {
    const ultimo = new Date(url.ultimoacesso)
    const diasSemAcesso = (agora - ultimo) / (1000 * 60 * 60 * 24)
    if (diasSemAcesso >= 1) {
      run('DELETE FROM urls WHERE slug = ?', [url.slug])
    }
  })
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

    const existente = get('SELECT * FROM urls WHERE original = ?', [url])
    if (existente) {
        return res.status(200).json({ slug: existente.slug, curta: `${base}/${existente.slug}`, original: url })
    }

    const slugPersonalizado = req.body.slug
    let slug

    if (slugPersonalizado) {
        if (slugPersonalizado.length < 3 || slugPersonalizado.length > 20) {
            return res.status(400).json({ erro: 'Slug deve ter entre 3 e 20 caracteres' })
        }
        const jaExiste = get('SELECT slug FROM urls WHERE slug = ?', [slugPersonalizado])
        if (jaExiste) {
            return res.status(400).json({ erro: 'Esse slug já existe, tente outro' })
        }
        slug = slugPersonalizado
    } else {
        slug = nanoid(6)
    }

    run(
        'INSERT INTO urls (slug, original, clicks, ultimoacesso, usuario_id, criadoem) VALUES (?, ?, ?, ?, ?, ?)',
        [slug, url, 0, new Date().toISOString(), req.usuarioId || null, new Date().toISOString()]
    )

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
    const resultado = run(
        'INSERT INTO usuarios (email, senha, nome, criadoem) VALUES (?, ?, ?, ?)',
        [email, hash, nome, new Date().toISOString()]
    )
    const token = jwt.sign({ id: Number(resultado.lastInsertRowid) }, JWT_SECRET, { expiresIn: '7d' })
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
    const usuario = get('SELECT * FROM usuarios WHERE email = ?', [email])

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
    limparURLsAntigas()
    const urls = all('SELECT * FROM urls WHERE usuario_id = ?', [req.usuarioId])
    res.json(urls)
})
//deletar as urls
 app.delete('/api/urls/:slug', autenticar, async (req, res) => {
    run('DELETE FROM urls WHERE slug = ?', [req.params.slug])
    res.json({ mensagem: `URL ${req.params.slug} deletada com sucesso` })
})

//o redirecionador do encurtador para o site real
    app.get('/:slug', async (req, res) => {
        const url = get('SELECT * FROM urls WHERE slug = ?', [req.params.slug])
        if (!url) {
            return res.status(404).sendFile('404.html', { root: 'public' })
        }
        run('UPDATE urls SET clicks = ?, ultimoacesso = ? WHERE slug = ?', [url.clicks + 1, new Date().toISOString(), req.params.slug])
        res.redirect(url.original)
    })

 app.listen(3000, () => { //ligar na porta 3000 do servidor 
    console.log('Servidor rodando na porta 3000')
 })