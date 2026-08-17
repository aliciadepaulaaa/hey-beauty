const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const crypto = require("crypto");
const { Pool } = require("pg");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

/* =========================================================
   APP / POSTGRESQL
========================================================= */

const app = express();

const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false,
});

pool
  .query("SELECT NOW()")
  .then(() => {
    console.log("✅ PostgreSQL conectado com sucesso");
  })
  .catch((error) => {
    console.error(
      "❌ Erro ao conectar PostgreSQL:",
      error.message
    );
  });

const root = path.join(__dirname, "..");

/* =========================================================
   CRIAR TABELA PRODUCTS
========================================================= */

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price INTEGER NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      sizes TEXT DEFAULT '',
      colors TEXT DEFAULT '',
      image TEXT DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,

      customer_name TEXT NOT NULL,
      cpf TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT DEFAULT '',

      cep TEXT DEFAULT '',
      street TEXT DEFAULT '',
      number TEXT DEFAULT '',
      complement TEXT DEFAULT '',
      neighborhood TEXT DEFAULT '',
      city TEXT DEFAULT '',
      state TEXT DEFAULT '',
      reference TEXT DEFAULT '',
      address TEXT DEFAULT '',

      delivery_method TEXT,
      shipping_fee INTEGER,
      shipping_status TEXT,
      shipping_service TEXT,
      shipping_service_id TEXT,
      shipping_delivery_time INTEGER,

      subtotal INTEGER NOT NULL DEFAULT 0,
      total INTEGER,

      items JSONB NOT NULL DEFAULT '[]'::jsonb,

      payment_status TEXT DEFAULT 'pending',
      payment_method TEXT,

      stock_decremented BOOLEAN NOT NULL DEFAULT FALSE,

      pagbank_order_id TEXT,
      pagbank_charge_id TEXT,

      pagbank_qr_code TEXT,
      pagbank_qr_code_image TEXT,

      installments INTEGER,
      payment_total INTEGER,
      pix_expiration TEXT,

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log("✅ Tabela products pronta");
  console.log("✅ Tabela orders pronta");
}
const dbReady = initDatabase().catch((error) => {
  console.error(
    "❌ Erro ao criar tabelas:",
    error
  );

  throw error;
});

/* =========================================================
   DADOS / ARQUIVOS
========================================================= */

const data = process.env.DATA_DIR
  ? process.env.DATA_DIR
  : path.join(root, "data");

const uploads = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, "uploads")
  : path.join(root, "uploads");

const productsFile = path.join(
  data,
  "products.json"
);

const ordersFile = path.join(
  data,
  "orders.json"
);

/* =========================================================
   CONFIGURAÇÕES
========================================================= */

const FIXED_SHIPPING = 1500;

const MELHOR_ENVIO_TOKEN =
  process.env.MELHOR_ENVIO_TOKEN || "";

const SHIPPING_ORIGIN_CEP = "42821810";

const PAGBANK_TOKEN =
  process.env.PAGBANK_TOKEN || "";

const PAGBANK_ENV =
  process.env.PAGBANK_ENV || "sandbox";

const PUBLIC_URL =
  process.env.PUBLIC_URL ||
  "https://hey-beauty.onrender.com";

const PAGBANK_BASE_URL =
  PAGBANK_ENV === "production"
    ? "https://api.pagseguro.com"
    : "https://sandbox.api.pagseguro.com";

/* =========================================================
   CRIAR PASTAS
========================================================= */

fs.mkdirSync(data, {
  recursive: true,
});

fs.mkdirSync(uploads, {
  recursive: true,
});

if (!fs.existsSync(productsFile)) {
  fs.writeFileSync(
    productsFile,
    "[]"
  );
}

if (!fs.existsSync(ordersFile)) {
  fs.writeFileSync(
    ordersFile,
    "[]"
  );
}

/* =========================================================
   JSON
   Pedidos ainda usam JSON nesta etapa.
========================================================= */

const read = (file) => {
  try {
    return JSON.parse(
      fs.readFileSync(file, "utf8")
    );
  } catch (error) {
    console.error(
      "Erro ao ler arquivo:",
      file,
      error
    );

    return [];
  }
};

const write = (file, value) => {
  fs.writeFileSync(
    file,
    JSON.stringify(
      value,
      null,
      2
    )
  );
};

/* =========================================================
   MIGRAR PRODUTOS ANTIGOS PARA POSTGRESQL
========================================================= */

async function migrateProductsFromJson() {
  await dbReady;

  const countResult = await pool.query(
    "SELECT COUNT(*)::int AS count FROM products"
  );

  if (countResult.rows[0].count > 0) {
    console.log(
      "✅ Produtos já estão no PostgreSQL"
    );

    return;
  }

  const legacyProducts =
    read(productsFile);

  if (!legacyProducts.length) {
    console.log(
      "ℹ️ Nenhum produto antigo para migrar"
    );

    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const product of legacyProducts) {
      await client.query(
        `
        INSERT INTO products (
          id,
          name,
          description,
          price,
          stock,
          sizes,
          colors,
          image,
          active
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9
        )
        ON CONFLICT (id) DO NOTHING
        `,
        [
          Number(product.id),
          product.name || "",
          product.description || "",
          Number(product.price || 0),

          Math.max(
            0,
            Number(product.stock || 0)
          ),

          product.sizes || "",
          product.colors || "",
          product.image || "",
          Boolean(product.active),
        ]
      );
    }

    await client.query(`
      SELECT setval(
        pg_get_serial_sequence(
          'products',
          'id'
        ),
        GREATEST(
          COALESCE(
            (SELECT MAX(id) FROM products),
            1
          ),
          1
        ),
        true
      );
    `);

    await client.query("COMMIT");

    console.log(
      `✅ ${legacyProducts.length} produto(s) migrado(s) para o PostgreSQL`
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const productsReady =
  migrateProductsFromJson().catch(
    (error) => {
      console.error(
        "❌ Erro ao migrar produtos:",
        error
      );

      throw error;
    }
  );

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(cors());

app.use(
  express.json({
    limit: "2mb",
  })
);

app.use(
  "/uploads",
  express.static(uploads)
);

/* =========================================================
   FUNÇÕES AUXILIARES
========================================================= */

const onlyNumbers = (value) =>
  String(value || "").replace(
    /\D/g,
    ""
  );

const findOrder = async (id) => {
  const result =
    await pool.query(
      `
      SELECT *
      FROM orders
      WHERE id = $1
      LIMIT 1
      `,
      [Number(id)]
    );

  return result.rowCount
    ? result.rows[0]
    : null;
};
const saveOrder =
  async (order) => {
    await pool.query(
      `
      UPDATE orders
      SET
        payment_status = $1,
        payment_method = $2,
        stock_decremented = $3,
        pagbank_order_id = $4,
        pagbank_charge_id = $5,
        pagbank_qr_code = $6,
        pagbank_qr_code_image = $7,
        installments = $8,
        payment_total = $9,
        pix_expiration = $10,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $11
      `,
      [
        order.payment_status,
        order.payment_method,
        Boolean(
          order.stock_decremented
        ),
        order.pagbank_order_id,
        order.pagbank_charge_id,
        order.pagbank_qr_code,
        order.pagbank_qr_code_image,
        order.installments,
        order.payment_total,
        order.pix_expiration,
        order.id,
      ]
    );
  };

const splitPhone = (phone) => {
  let numbers = onlyNumbers(phone);

  if (numbers.startsWith("55")) {
    numbers = numbers.slice(2);
  }

  const area =
    numbers.slice(0, 2);

  const number =
    numbers.slice(2);

  if (
    area.length !== 2 ||
    number.length < 8
  ) {
    return null;
  }

  return {
    country: "55",
    area,
    number,
    type: "MOBILE",
  };
};

const buildCustomer = (order) => {
  const customer = {
    name: order.customer_name,
    email: order.email,
    tax_id: onlyNumbers(order.cpf),
  };

  const phone =
    splitPhone(order.phone);

  if (phone) {
    customer.phones = [phone];
  }

  return customer;
};

const buildPagBankItems = (order) =>
  (order.items || []).map(
    (item) => ({
      reference_id:
        String(item.id),

      name:
        String(item.name).slice(
          0,
          100
        ),

      quantity:
        Number(item.quantity),

      unit_amount:
        Number(item.unit_price),
    })
  );

const buildShipping = (order) => {
  if (
    !order.street ||
    !order.number ||
    !order.city ||
    !order.state ||
    !order.cep
  ) {
    return undefined;
  }

  return {
    address: {
      street: order.street,

      number:
        String(order.number),

      ...(order.complement
        ? {
            complement:
              order.complement,
          }
        : {}),

      locality:
        order.neighborhood || "",

      city: order.city,

      region_code:
        String(
          order.state
        ).toUpperCase(),

      country: "BRA",

      postal_code:
        onlyNumbers(order.cep),
    },
  };
};/* =========================================================
   PAGBANK
========================================================= */

async function pagBankRequest(
  endpoint,
  options = {}
) {
  if (!PAGBANK_TOKEN) {
    throw new Error(
      "PAGBANK_TOKEN não configurado"
    );
  }

  const response = await fetch(
    `${PAGBANK_BASE_URL}${endpoint}`,
    {
      ...options,

      headers: {
        Authorization:
          `Bearer ${PAGBANK_TOKEN}`,

        Accept:
          "application/json",

        "Content-Type":
          "application/json",

        ...(options.headers || {}),
      },
    }
  );

  const data = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    console.error(
      "Erro PagBank:",
      response.status,
      data
    );

    throw new Error(
      data?.error_messages?.[0]
        ?.description ||
      data?.message ||
      `Erro PagBank (${response.status})`
    );
  }

  return data;
}

/* =========================================================
   STATUS PAGBANK
========================================================= */

const getChargeStatus = (
  pagbankOrder
) => {
  const charges =
    pagbankOrder?.charges || [];

  if (!charges.length) {
    return null;
  }

  const charge = charges[0];

  return {
    status:
      charge.status || null,

    chargeId:
      charge.id || null,
  };
};

/* =========================================================
   BAIXA DE ESTOQUE NO POSTGRESQL
========================================================= */

async function decrementOrderStock(
  order
) {
  if (
    !order ||
    order.stock_decremented
  ) {
    return;
  }

  await productsReady;

  const client =
    await pool.connect();

  try {
    await client.query("BEGIN");

    for (const item of order.items || []) {
      const productId =
        Number(item.id);

      const quantity =
        Number(item.quantity);

      if (
        !Number.isInteger(productId) ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        throw new Error(
          "Item inválido para baixa de estoque"
        );
      }

      const result =
        await client.query(
          `
          UPDATE products
          SET
            stock = stock - $1,
            updated_at =
              CURRENT_TIMESTAMP
          WHERE
            id = $2
            AND stock >= $1
          RETURNING
            id,
            name,
            stock
          `,
          [
            quantity,
            productId,
          ]
        );

      if (!result.rowCount) {
        throw new Error(
          `Estoque insuficiente para o produto ${productId}`
        );
      }
    }

    await client.query("COMMIT");

    order.stock_decremented = true;

    console.log(
      `✅ Estoque baixado para o pedido ${order.id}`
    );
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "❌ Erro ao baixar estoque:",
      error
    );

    throw error;
  } finally {
    client.release();
  }
}

/* =========================================================
   NORMALIZAR PRODUTO DO POSTGRES
========================================================= */

const normalizeProduct = (row) => ({
  id: Number(row.id),

  name: row.name || "",

  description:
    row.description || "",

  price:
    Number(row.price || 0),

  stock:
    Number(row.stock || 0),

  sizes:
    row.sizes || "",

  colors:
    row.colors || "",

  image:
    row.image || "",

  active:
    Boolean(row.active),

  created_at:
    row.created_at,

  updated_at:
    row.updated_at,
});

/* =========================================================
   AUTENTICAÇÃO ADMIN
========================================================= */

const ADMIN_USER =
  process.env.ADMIN_USER ||
  "admin";

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD ||
  "admin";

function requireAdmin(
  req,
  res,
  next
) {
  const auth =
    req.headers.authorization || "";

  if (
    !auth.startsWith("Basic ")
  ) {
    res.set(
      "WWW-Authenticate",
      'Basic realm="Hey Beauty Admin"'
    );

    return res
      .status(401)
      .json({
        error:
          "Autenticação necessária",
      });
  }

  try {
    const encoded =
      auth.slice(6);

    const decoded =
      Buffer.from(
        encoded,
        "base64"
      ).toString("utf8");

    const separator =
      decoded.indexOf(":");

    const user =
      decoded.slice(
        0,
        separator
      );

    const password =
      decoded.slice(
        separator + 1
      );

    if (
      user !== ADMIN_USER ||
      password !== ADMIN_PASSWORD
    ) {
      return res
        .status(401)
        .json({
          error:
            "Usuário ou senha inválidos",
        });
    }

    next();
  } catch {
    return res
      .status(401)
      .json({
        error:
          "Autenticação inválida",
      });
  }
}

/* =========================================================
   UPLOAD DE IMAGENS
========================================================= */

const storage =
  multer.diskStorage({
    destination:
      (
        req,
        file,
        callback
      ) => {
        callback(
          null,
          uploads
        );
      },

    filename:
      (
        req,
        file,
        callback
      ) => {
        const extension =
          path.extname(
            file.originalname
          );

        const filename =
          `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${extension}`;

        callback(
          null,
          filename
        );
      },
  });

const upload = multer({
  storage,

  limits: {
    fileSize:
      5 * 1024 * 1024,
  },

  fileFilter:
    (
      req,
      file,
      callback
    ) => {
      if (
        file.mimetype.startsWith(
          "image/"
        )
      ) {
        return callback(
          null,
          true
        );
      }

      callback(
        new Error(
          "Envie somente arquivos de imagem"
        )
      );
    },
});

/* =========================================================
   UPLOAD ADMIN
========================================================= */

app.post(
  "/api/upload",

  requireAdmin,

  upload.single("image"),

  (req, res) => {
    if (!req.file) {
      return res
        .status(400)
        .json({
          error:
            "Nenhuma imagem enviada",
        });
    }
return res.json({
  image:
    `/uploads/${req.file.filename}`,
});
  }
);
/* =========================================================
   PRODUTOS — PÚBLICO
========================================================= */

app.get(
  "/api/products",

  async (req, res) => {
    try {
      await productsReady;

      const result =
        await pool.query(`
          SELECT *
          FROM products
          WHERE active = TRUE
          ORDER BY id DESC
        `);

      return res.json(
        result.rows.map(
          normalizeProduct
        )
      );
    } catch (error) {
      console.error(
        "Erro ao listar produtos:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Erro ao carregar produtos",
        });
    }
  }
);

/* =========================================================
   PRODUTO INDIVIDUAL — PÚBLICO
========================================================= */

app.get(
  "/api/products/:id",

  async (req, res) => {
    try {
      await productsReady;

      const id =
        Number(req.params.id);

      if (
        !Number.isInteger(id)
      ) {
        return res
          .status(400)
          .json({
            error:
              "Produto inválido",
          });
      }

      const result =
        await pool.query(
          `
          SELECT *
          FROM products
          WHERE
            id = $1
            AND active = TRUE
          LIMIT 1
          `,
          [id]
        );

      if (!result.rowCount) {
        return res
          .status(404)
          .json({
            error:
              "Produto não encontrado",
          });
      }

      return res.json(
        normalizeProduct(
          result.rows[0]
        )
      );
    } catch (error) {
      console.error(
        "Erro ao buscar produto:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Erro ao carregar produto",
        });
    }
  }
);

/* =========================================================
   PRODUTOS — ADMIN
========================================================= */

app.get(
  "/api/admin/products",

  requireAdmin,

  async (req, res) => {
    try {
      await productsReady;

      const result =
        await pool.query(`
          SELECT *
          FROM products
          ORDER BY id DESC
        `);

      return res.json(
        result.rows.map(
          normalizeProduct
        )
      );
    } catch (error) {
      console.error(
        "Erro ao listar produtos do admin:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Erro ao carregar produtos",
        });
    }
  }
);

/* =========================================================
   CADASTRAR PRODUTO
========================================================= */

app.post(
  "/api/admin/products",

  requireAdmin,

  async (req, res) => {
    try {
      await productsReady;

      const {
        name,
        description = "",
        price,
        stock = 0,
        sizes = "",
        colors = "",
        image = "",
        active = true,
      } = req.body;

      const productName =
        String(
          name || ""
        ).trim();

      const productPrice =
  Math.round(
    Number(price) * 100
  );
      const productStock =
        Number(stock);

      if (!productName) {
        return res
          .status(400)
          .json({
            error:
              "Informe o nome do produto",
          });
      }

      if (
        !Number.isInteger(
          productPrice
        ) ||
        productPrice < 0
      ) {
        return res
          .status(400)
          .json({
            error:
              "Preço inválido",
          });
      }

      if (
        !Number.isInteger(
          productStock
        ) ||
        productStock < 0
      ) {
        return res
          .status(400)
          .json({
            error:
              "Estoque inválido",
          });
      }

      const result =
        await pool.query(
          `
          INSERT INTO products (
            name,
            description,
            price,
            stock,
            sizes,
            colors,
            image,
            active
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8
          )
          RETURNING *
          `,
          [
            productName,

            String(
              description || ""
            ),

            productPrice,
            productStock,

            String(
              sizes || ""
            ),

            String(
              colors || ""
            ),

            String(
              image || ""
            ),

            Boolean(active),
          ]
        );

      return res
        .status(201)
        .json(
          normalizeProduct(
            result.rows[0]
          )
        );
    } catch (error) {
      console.error(
        "Erro ao cadastrar produto:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Erro ao cadastrar produto",
        });
    }
  }
);

/* =========================================================
   EDITAR PRODUTO / ESTOQUE
========================================================= */

app.put(
  "/api/admin/products/:id",

  requireAdmin,

  async (req, res) => {
    try {
      await productsReady;

      const id =
        Number(req.params.id);

      if (
        !Number.isInteger(id)
      ) {
        return res
          .status(400)
          .json({
            error:
              "Produto inválido",
          });
      }

      const currentResult =
        await pool.query(
          `
          SELECT *
          FROM products
          WHERE id = $1
          LIMIT 1
          `,
          [id]
        );

      if (
        !currentResult.rowCount
      ) {
        return res
          .status(404)
          .json({
            error:
              "Produto não encontrado",
          });
      }

      const current =
        currentResult.rows[0];

      const name =
        req.body.name !== undefined
          ? String(
              req.body.name
            ).trim()
          : current.name;

      const description =
        req.body.description !==
        undefined
          ? String(
              req.body.description ||
                ""
            )
          : current.description;

      const price =
  req.body.price !== undefined
    ? Math.round(
        Number(
          req.body.price
        ) * 100
      )
    : Number(
        current.price
      );

      const stock =
        req.body.stock !== undefined
          ? Number(
              req.body.stock
            )
          : Number(
              current.stock
            );

      const sizes =
        req.body.sizes !== undefined
          ? String(
              req.body.sizes || ""
            )
          : current.sizes;

      const colors =
        req.body.colors !== undefined
          ? String(
              req.body.colors || ""
            )
          : current.colors;

      const image =
        req.body.image !== undefined
          ? String(
              req.body.image || ""
            )
          : current.image;

      const active =
        req.body.active !== undefined
          ? Boolean(
              req.body.active
            )
          : Boolean(
              current.active
            );

      if (!name) {
        return res
          .status(400)
          .json({
            error:
              "Informe o nome do produto",
          });
      }

      if (
        !Number.isInteger(price) ||
        price < 0
      ) {
        return res
          .status(400)
          .json({
            error:
              "Preço inválido",
          });
      }

      if (
        !Number.isInteger(stock) ||
        stock < 0
      ) {
        return res
          .status(400)
          .json({
            error:
              "Estoque inválido",
          });
      }

      const result =
        await pool.query(
          `
          UPDATE products
          SET
            name = $1,
            description = $2,
            price = $3,
            stock = $4,
            sizes = $5,
            colors = $6,
            image = $7,
            active = $8,
            updated_at =
              CURRENT_TIMESTAMP
          WHERE id = $9
          RETURNING *
          `,
          [
            name,
            description,
            price,
            stock,
            sizes,
            colors,
            image,
            active,
            id,
          ]
        );

      return res.json(
        normalizeProduct(
          result.rows[0]
        )
      );
    } catch (error) {
      console.error(
        "Erro ao editar produto:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Erro ao editar produto",
        });
    }
  }
);

/* =========================================================
   EXCLUIR PRODUTO
========================================================= */

app.delete(
  "/api/admin/products/:id",

  requireAdmin,

  async (req, res) => {
    try {
      await productsReady;

      const id =
        Number(req.params.id);

      if (
        !Number.isInteger(id)
      ) {
        return res
          .status(400)
          .json({
            error:
              "Produto inválido",
          });
      }

      const result =
        await pool.query(
          `
          DELETE FROM products
          WHERE id = $1
          RETURNING id
          `,
          [id]
        );

      if (!result.rowCount) {
        return res
          .status(404)
          .json({
            error:
              "Produto não encontrado",
          });
      }

      return res.json({
        ok: true,
      });
    } catch (error) {
      console.error(
        "Erro ao excluir produto:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Erro ao excluir produto",
        });
    }
  }
);/* =========================================================
   PEDIDOS — ADMIN
   Ainda ficam no JSON nesta etapa.
========================================================= */

app.get(
  "/api/orders",

  requireAdmin,

  async (req, res) => {
    try {
      const result =
        await pool.query(`
          SELECT *
          FROM orders
          ORDER BY id DESC
        `);

      return res.json(
        result.rows
      );
    } catch (error) {
      console.error(
        "Erro ao listar pedidos:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Erro ao carregar pedidos",
        });
    }
  }
);
/* =========================================================
   CHECKOUT
========================================================= */

app.post(
  "/api/checkout",

  async (req, res) => {
    try {
      await productsReady;

      const {
        customer,
        items,
        delivery,
      } = req.body;

      if (
        !customer?.name ||
        !customer?.cpf ||
        !customer?.email ||
        !customer?.address ||
        !Array.isArray(items) ||
        !items.length
      ) {
        return res
          .status(400)
          .json({
            error:
              "Dados incompletos.",
          });
      }

      const cpf =
        onlyNumbers(
          customer.cpf
        );

      if (
        cpf.length !== 11
      ) {
        return res
          .status(400)
          .json({
            error:
              "CPF inválido.",
          });
      }

      const allowedDelivery = [
        "salvador",
        "lauro",
        "uber_99",
        "nuvem_envio",
      ];

      if (
        !allowedDelivery.includes(
          delivery?.method
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              "Forma de entrega inválida.",
          });
      }

      let subtotal = 0;

      const details = [];

      /*
         IMPORTANTE:
         preço e estoque vêm do banco,
         nunca do navegador da cliente.
      */

      for (
        const item of items
      ) {
        const productId =
          Number(item.id);

        const quantity =
          Number(
            item.quantity
          );

        if (
          !Number.isInteger(
            productId
          ) ||
          !Number.isInteger(
            quantity
          ) ||
          quantity < 1
        ) {
          return res
            .status(400)
            .json({
              error:
                "Produto ou quantidade inválida.",
            });
        }

        const result =
          await pool.query(
            `
            SELECT *
            FROM products
            WHERE
              id = $1
              AND active = TRUE
            LIMIT 1
            `,
            [productId]
          );

        if (
          !result.rowCount
        ) {
          return res
            .status(400)
            .json({
              error:
                "Produto inválido.",
            });
        }

        const product =
          result.rows[0];

        const availableStock =
          Number(
            product.stock || 0
          );

        if (
          quantity >
          availableStock
        ) {
          return res
            .status(400)
            .json({
              error:
                `Estoque insuficiente para ${product.name}. Disponível: ${availableStock}.`,
            });
        }

        const unitPrice =
          Number(
            product.price
          );

        subtotal +=
          unitPrice *
          quantity;

        details.push({
          id:
            Number(
              product.id
            ),

          name:
            product.name,

          quantity,

          unit_price:
            unitPrice,

          size:
            item.size || "",

          color:
            item.color || "",
        });
      }

      /* =====================================================
         ENTREGA
      ===================================================== */

      let shippingFee =
        null;

      let shippingStatus =
        "pending_quote";

      let shippingService =
        null;

      let shippingServiceId =
        null;

      let shippingDeliveryTime =
        null;

      /* SALVADOR / LAURO */

      if (
        delivery.method ===
          "salvador" ||
        delivery.method ===
          "lauro"
      ) {
        shippingFee =
          FIXED_SHIPPING;

        shippingStatus =
          "calculated";
      }

      /* CORREIOS */

      if (
        delivery.method ===
        "nuvem_envio"
      ) {
        const sentShipping =
          Number(
            delivery.shipping
          );

        if (
          !Number.isFinite(
            sentShipping
          ) ||
          sentShipping <= 0
        ) {
          return res
            .status(400)
            .json({
              error:
                "Calcule e escolha uma opção dos Correios antes de continuar.",
            });
        }

        shippingFee =
          Math.round(
            sentShipping
          );

        shippingStatus =
          "calculated";

        shippingService =
          delivery.service ||
          "Correios";

        shippingServiceId =
          delivery.serviceId ||
          null;

        shippingDeliveryTime =
          Number(
            delivery.deliveryTime ||
              0
          ) || null;
      }

      /* UBER / 99 */

      if (
  delivery.method ===
  "uber_99"
) {
  shippingFee = 0;

  shippingStatus =
    "paid_separately";

  shippingService =
    "Uber Flash / 99 Entrega";
}
      const total =
        shippingFee === null
          ? null
          : subtotal +
            shippingFee;

      /* =====================================================
         CRIAR PEDIDO
      ===================================================== */

     const result =
  await pool.query(
    `
    INSERT INTO orders (
      customer_name,
      cpf,
      email,
      phone,

      cep,
      street,
      number,
      complement,
      neighborhood,
      city,
      state,
      reference,
      address,

      delivery_method,
      shipping_fee,
      shipping_status,
      shipping_service,
      shipping_service_id,
      shipping_delivery_time,

      subtotal,
      total,

      items,

      payment_status,
      payment_method,
      stock_decremented
    )
    VALUES (
      $1,$2,$3,$4,
      $5,$6,$7,$8,$9,$10,$11,$12,$13,
      $14,$15,$16,$17,$18,$19,
      $20,$21,
      $22::jsonb,
      $23,$24,$25
    )
    RETURNING *
    `,
    [
      customer.name,
      cpf,
      customer.email,
      customer.phone || "",

      customer.cep || "",
      customer.street || "",
      customer.number || "",
      customer.complement || "",
      customer.neighborhood || "",
      customer.city || "",
      customer.state || "",
      customer.reference || "",
      customer.address,

      delivery.method,
      shippingFee,
      shippingStatus,
      shippingService,
      shippingServiceId,
      shippingDeliveryTime,

      subtotal,
      total,

      JSON.stringify(details),

      "pending",
      null,
      false,
    ]
  );

const order =
  result.rows[0];

const id =
  order.id;

      return res.json({
        orderId: id,

        subtotal,

        shippingFee,

        shippingStatus,

        total,

        deliveryMethod:
          delivery.method,
      });
    } catch (error) {
      console.error(
        "Erro checkout:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Erro ao criar pedido.",
        });
    }
  }
);

/* =========================================================
   PARCELAS PAGBANK
========================================================= */

app.get(
  "/api/pagbank/installments",

  async (req, res) => {
    try {
      const orderId =
        req.query.orderId;

      const bin =
        onlyNumbers(
          req.query.bin
        ).slice(
          0,
          6
        );

      if (
        !orderId ||
        bin.length !== 6
      ) {
        return res
          .status(400)
          .json({
            error:
              "Informe o pedido e os 6 primeiros números do cartão.",
          });
      }

     const order =
  await findOrder(
    orderId
  );

      if (!order) {
        return res
          .status(404)
          .json({
            error:
              "Pedido não encontrado.",
          });
      }

      if (
        order.total == null
      ) {
        return res
          .status(400)
          .json({
            error:
              "Defina o frete antes do pagamento.",
          });
      }

      const query =
        new URLSearchParams({
          payment_methods:
            "CREDIT_CARD",

          value:
            String(
              order.total
            ),

          max_installments:
            "12",

          /*
             0 = nenhuma parcela
             obrigatoriamente sem juros.
          */
          max_installments_no_interest:
            "0",

          credit_card_bin:
            bin,
        });

      const result =
        await pagBankRequest(
          "/charges/fees/calculate?" +
            query.toString(),
          {
            method:
              "GET",
          }
        );

      const creditCard =
        result
          ?.payment_methods
          ?.credit_card ||
        {};

      const brand =
        Object.keys(
          creditCard
        )[0];

      const plans =
        brand
          ? creditCard[
              brand
            ]
              ?.installment_plans ||
            []
          : [];

      return res.json({
        brand,

        plans:
          plans.filter(
            (plan) =>
              Number(
                plan.installments
              ) <= 12
          ),
      });
    } catch (error) {
      console.error(
        "Erro parcelas:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            error.message ||
            "Erro ao calcular parcelas.",
        });
    }
  }
);

/* =========================================================
   PIX PAGBANK
========================================================= */

app.post(
  "/api/pagbank/pix",

  async (req, res) => {
    try {
      const {
        orderId,
      } = req.body;

      const order =
  await findOrder(
    orderId
  );

      if (!order) {
        return res
          .status(404)
          .json({
            error:
              "Pedido não encontrado.",
          });
      }

      if (
        order.total == null
      ) {
        return res
          .status(400)
          .json({
            error:
              "Defina o valor do frete antes de gerar o Pix.",
          });
      }

      if (
        order.payment_status ===
        "paid"
      ) {
        return res
          .status(400)
          .json({
            error:
              "Este pedido já foi pago.",
          });
      }

      const expiration =
        new Date(
          Date.now() +
            24 *
              60 *
              60 *
              1000
        );

      const payload = {
        reference_id:
          `HEY-BEAUTY-PIX-${order.id}`,

        customer:
          buildCustomer(
            order
          ),

        items:
          buildPagBankItems(
            order
          ),

        qr_codes: [
          {
            amount: {
              value:
                Number(
                  order.total
                ),
            },

            expiration_date:
              expiration
                .toISOString(),
          },
        ],

        notification_urls: [
          `${PUBLIC_URL}/api/pagbank/webhook`,
        ],
      };

      const shipping =
        buildShipping(
          order
        );

      if (shipping) {
        payload.shipping =
          shipping;
      }

      const pagbank =
        await pagBankRequest(
          "/orders",
          {
            method:
              "POST",

            headers: {
              "x-idempotency-key":
                crypto.randomUUID(),
            },

            body:
              JSON.stringify(
                payload
              ),
          }
        );

      const qr =
        pagbank
          ?.qr_codes?.[0];

      const imageLink =
        qr?.links?.find(
          (link) =>
            link.media ===
            "image/png"
        );

      const textLink =
        qr?.links?.find(
          (link) =>
            link.media ===
            "text/plain"
        );

      let qrText =
        qr?.text ||
        null;

      /*
         Algumas respostas do PagBank
         trazem o Pix copia-e-cola
         através de link.
      */

      if (
        !qrText &&
        textLink?.href
      ) {
        try {
          const textResponse =
            await fetch(
              textLink.href
            );

          if (
            textResponse.ok
          ) {
            qrText =
              await textResponse
                .text();
          }
        } catch (
          textError
        ) {
          console.error(
            "Erro ao obter Pix copia e cola:",
            textError
          );
        }
      }

      const updatedOrder = {
        ...order,

        payment_method:
          "pix",

        payment_status:
          "waiting_payment",

        pagbank_order_id:
          pagbank.id ||
          null,

        pagbank_qr_code:
          qrText,

        pagbank_qr_code_image:
          imageLink?.href ||
          null,

        pix_expiration:
          qr?.expiration_date ||
          null,

        updated_at:
          new Date()
            .toISOString(),
      };

      await saveOrder(
  updatedOrder
);

      return res.json({
        ok: true,

        orderId:
          order.id,

        status:
          "WAITING_PAYMENT",

        qrCode:
          qrText,

        qrCodeImage:
          imageLink?.href ||
          null,

        expirationDate:
          qr?.expiration_date ||
          null,

        message:
          "Pix gerado com sucesso.",
      });
    } catch (error) {
      console.error(
        "Erro Pix PagBank:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            error.message ||
            "Erro ao gerar Pix.",
        });
    }
  }
);/* =========================================================
   CARTÃO PAGBANK
========================================================= */

app.post(
  "/api/pagbank/card",

  async (req, res) => {
    try {
      const {
        orderId,
        installments,
        encryptedCard,
        holder,
        bin,
      } = req.body;

      if (
        !orderId ||
        !encryptedCard ||
        !holder?.name ||
        !holder?.taxId
      ) {
        return res
          .status(400)
          .json({
            error:
              "Dados do cartão incompletos.",
          });
      }

      const order =
  await findOrder(
    orderId
  );

      if (!order) {
        return res
          .status(404)
          .json({
            error:
              "Pedido não encontrado.",
          });
      }

      if (
        order.total == null
      ) {
        return res
          .status(400)
          .json({
            error:
              "Defina o frete antes do pagamento.",
          });
      }

      if (
        order.payment_status ===
        "paid"
      ) {
        return res
          .status(400)
          .json({
            error:
              "Este pedido já foi pago.",
          });
      }

      const installmentCount =
        Math.min(
          12,
          Math.max(
            1,
            Number(
              installments || 1
            )
          )
        );

      const cleanBin =
        onlyNumbers(
          bin
        ).slice(
          0,
          6
        );

      if (
        cleanBin.length !== 6
      ) {
        return res
          .status(400)
          .json({
            error:
              "Cartão inválido.",
          });
      }

      /* =====================================================
         CONSULTAR PARCELAMENTO
      ===================================================== */

      const feeQuery =
        new URLSearchParams({
          payment_methods:
            "CREDIT_CARD",

          value:
            String(
              order.total
            ),

          max_installments:
            "12",

          max_installments_no_interest:
            "0",

          credit_card_bin:
            cleanBin,
        });

      const feesResult =
        await pagBankRequest(
          "/charges/fees/calculate?" +
            feeQuery.toString(),
          {
            method:
              "GET",
          }
        );

      const creditCard =
        feesResult
          ?.payment_methods
          ?.credit_card ||
        {};

      const brand =
        Object.keys(
          creditCard
        )[0];

      const plans =
        brand
          ? creditCard[
              brand
            ]
              ?.installment_plans ||
            []
          : [];

      const selectedPlan =
        plans.find(
          (plan) =>
            Number(
              plan.installments
            ) ===
            installmentCount
        );

      if (
        !selectedPlan
      ) {
        return res
          .status(400)
          .json({
            error:
              "Parcelamento não disponível para este cartão.",
          });
      }

      const chargeAmount =
        Number(
          selectedPlan
            ?.amount
            ?.value ||
          order.total
        );

      /* =====================================================
         CRIAR COBRANÇA
      ===================================================== */
     const payload = {
        reference_id:
          `HEY-BEAUTY-${order.id}`,

        customer:
          buildCustomer(
            order
          ),

        items:
          buildPagBankItems(
            order
          ),

        notification_urls: [
          `${PUBLIC_URL}/api/pagbank/webhook`,
        ],

        charges: [
          {
            reference_id:
              `HEY-BEAUTY-CHARGE-${order.id}`,

            description:
              `Pedido Hey Beauty #${order.id}`,

            amount: {
              value:
                chargeAmount,

              currency:
                "BRL",
            },

            payment_method: {
              type:
                "CREDIT_CARD",

              installments:
                installmentCount,

              capture:
                true,

              card: {
                encrypted:
                  encryptedCard,

                store:
                  false,
              },

              holder: {
                name:
                  holder.name,

                tax_id:
                  onlyNumbers(
                    holder.taxId
                  ),
              },
            },
          },
        ],
      };

      const shipping =
        buildShipping(
          order
        );

      if (shipping) {
        payload.shipping =
          shipping;
      }

      const pagbank =
        await pagBankRequest(
          "/orders",
          {
            method:
              "POST",

            headers: {
              "x-idempotency-key":
                crypto.randomUUID(),
            },

            body:
              JSON.stringify(
                payload
              ),
          }
        );

      const charge =
        pagbank
          ?.charges?.[0];

      const status =
        charge?.status ||
        "UNKNOWN";

      let updatedOrder = {
        ...order,

        payment_method:
          "credit_card",

        payment_status:
          status === "PAID"
            ? "paid"
            : String(
                status
              ).toLowerCase(),

        installments:
          installmentCount,

        payment_total:
          chargeAmount,

        pagbank_order_id:
          pagbank.id ||
          null,

        pagbank_charge_id:
          charge?.id ||
          null,

        updated_at:
          new Date()
            .toISOString(),
      };

      if (
        status === "PAID"
      ) {
        await decrementOrderStock(
          updatedOrder
        );
      }

      await saveOrder(
        updatedOrder
      );

      return res.json({
        ok: true,

        status,

        orderId:
          order.id,

        installments:
          installmentCount,

        installmentValue:
          Number(
            selectedPlan
              ?.installment_value ||
              0
          ),

        total:
          chargeAmount,

        interestFree:
          Boolean(
            selectedPlan
              ?.interest_free
          ),

        message:
          charge
            ?.payment_response
            ?.message ||
          (
            status ===
            "PAID"
              ? "Pagamento aprovado."
              : "Pagamento enviado para análise."
          ),
      });
    } catch (error) {
      console.error(
        "Erro cartão PagBank:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            error.message ||
            "Erro ao processar cartão.",
        });
    }
  }
);
/*=========================================================
   WEBHOOK PAGBANK - POSTGRESQL
========================================================= */

app.post(
  "/api/pagbank/webhook",

  async (req, res) => {
    try {
      const payload =
        req.body;

      console.log(
        "Webhook PagBank:",
        JSON.stringify(
          payload
        )
      );

      let order = null;

      /*
         1) Primeiro tenta localizar
         pelo ID do pedido do PagBank.
      */

      if (
        payload?.id
      ) {
        const result =
          await pool.query(
            `
            SELECT *
            FROM orders
            WHERE pagbank_order_id = $1
            LIMIT 1
            `,
            [
              payload.id,
            ]
          );

        if (
          result.rowCount
        ) {
          order =
            result.rows[0];
        }
      }

      /*
         2) Se não encontrou pelo ID
         do PagBank, tenta pelo
         reference_id.

         Exemplos:
         HEY-BEAUTY-PIX-123
         HEY-BEAUTY-123
      */

      if (
        !order &&
        payload?.reference_id
      ) {
        const match =
          String(
            payload.reference_id
          ).match(
            /(\d+)$/
          );

        if (match) {
          order =
            await findOrder(
              Number(
                match[1]
              )
            );
        }
      }

      /*
         3) Algumas notificações
         podem trazer reference_id
         dentro da cobrança.
      */

      const charge =
        payload
          ?.charges?.[0];

      if (
        !order &&
        charge?.reference_id
      ) {
        const match =
          String(
            charge.reference_id
          ).match(
            /(\d+)$/
          );

        if (match) {
          order =
            await findOrder(
              Number(
                match[1]
              )
            );
        }
      }

      if (order) {
        /*
           PAGAMENTO CONFIRMADO
        */

        if (
          charge?.status ===
          "PAID"
        ) {
          order.payment_status =
            "paid";

          /*
             A função já verifica
             stock_decremented,
             evitando baixa dupla.
          */

          if (
            !order.stock_decremented
          ) {
            await decrementOrderStock(
              order
            );
          }
        } else if (
          charge?.status
        ) {
          order.payment_status =
            String(
              charge.status
            ).toLowerCase();
        }

        if (
          charge?.id
        ) {
          order.pagbank_charge_id =
            charge.id;
        }

        if (
          payload?.id
        ) {
          order.pagbank_order_id =
            payload.id;
        }

        order.updated_at =
          new Date()
            .toISOString();

        /*
           Agora salva o pedido
           diretamente no PostgreSQL.
        */

        await saveOrder(
          order
        );

        console.log(
          `✅ Pedido ${order.id} atualizado pelo webhook`
        );
      } else {
        console.log(
          "⚠️ Webhook recebido, mas pedido não encontrado"
        );
      }

      return res.sendStatus(
        200
      );
    } catch (error) {
      console.error(
        "Erro webhook:",
        error
      );

      /*
         Mantemos 200 para evitar
         repetição infinita da
         notificação do PagBank.
      */

      return res.sendStatus(
        200
      );
    }
  }
);

/* =========================================================
   FRETE — MELHOR ENVIO / CORREIOS
   PAC + SEDEX + MINI ENVIOS
========================================================= */

app.post(
  "/api/frete/sedex",

  async (req, res) => {
    try {
      const cepDestino =
        onlyNumbers(
          req.body.cep
        );

      if (
        cepDestino.length !== 8
      ) {
        return res
          .status(400)
          .json({
            error:
              "CEP inválido.",
          });
      }

      if (
        !MELHOR_ENVIO_TOKEN
      ) {
        return res
          .status(500)
          .json({
            error:
              "Token do Melhor Envio não configurado.",
          });
      }

      const body = {
        from: {
          postal_code:
            SHIPPING_ORIGIN_CEP,
        },

        to: {
          postal_code:
            cepDestino,
        },

    package: {
  height: 5,
  width: 25,
  length: 30,
  weight: 0.5,
}
      };

      const response =
        await fetch(
          "https://melhorenvio.com.br/api/v2/me/shipment/calculate",
          {
            method:
              "POST",

            headers: {
              Authorization:
                `Bearer ${MELHOR_ENVIO_TOKEN}`,

              Accept:
                "application/json",

              "Content-Type":
                "application/json",

              "User-Agent":
                "Hey Beauty",
            },

            body:
              JSON.stringify(
                body
              ),
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (
        !response.ok
      ) {
        console.error(
          "Erro Melhor Envio:",
          data
        );

        return res
          .status(
            response.status
          )
          .json({
            error:
              data.message ||
              data.error ||
              "Erro ao calcular frete.",
          });
      }

      /*
         IDs que apareceram na sua
         conta do Melhor Envio:

         1  = PAC
         2  = SEDEX
         17 = Mini Envios
      */

      const correiosIds = [
        1,
        2,
        17,
      ];

      const options =
        Array.isArray(data)
          ? data
              .filter(
                (service) =>
                  correiosIds.includes(
                    Number(
                      service.id
                    )
                  )
              )
              .filter(
                (service) =>
                  !service.error &&
                  service.price
              )
              .map(
                (service) => ({
                  serviceId:
                    Number(
                      service.id
                    ),

                  service:
                    service.name,

                  company:
                    "Correios",

                  price:
                    Math.round(
                      Number(
                        service.custom_price ||
                          service.price
                      ) * 100
                    ),

                  deliveryTime:
                    Number(
                      service.custom_delivery_time ||
                        service.delivery_time
                    ),

                  deliveryRange:
                    service.custom_delivery_range ||
                    service.delivery_range ||
                    null,
                })
              )
          : [];

      if (
        !options.length
      ) {
        return res
          .status(400)
          .json({
            error:
              "Nenhuma opção dos Correios disponível para este CEP.",
          });
      }

      /*
         Mais barato aparece primeiro.
      */

      options.sort(
        (a, b) =>
          a.price -
          b.price
      );

      return res.json({
        options,
      });
    } catch (error) {
      console.error(
        "Erro frete Correios:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Não foi possível calcular o frete.",
        });
    }
  }
);

/* =========================================================
   FRONTEND
========================================================= */

const clientDist =
  path.join(
    root,
    "client",
    "dist"
  );

app.use(
  express.static(
    clientDist
  )
);

/*
   React Router:
   qualquer rota que não seja API
   retorna index.html.
*/

app.get(
  "/{*splat}",

  (req, res) => {
    res.sendFile(
      path.join(
        clientDist,
        "index.html"
      )
    );
  }
);

/* =========================================================
   INICIAR SERVIDOR
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",

  () => {
    console.log(
      `✅ HEY BEAUTY rodando na porta ${PORT}`
    );

    console.log(
      `✅ PagBank: ${PAGBANK_ENV}`
    );

    console.log(
      "✅ Produtos e estoque: PostgreSQL"
    );

    console.log(
      "ℹ️ Pedidos: JSON (migração será a próxima etapa)"
    );
  }
);