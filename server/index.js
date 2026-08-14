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
    console.error("❌ Erro ao conectar PostgreSQL:", error.message);
  });
const root =
  path.join(__dirname, "..");
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

  console.log("✅ Tabela products pronta");
}

initDatabase().catch((error) => {
  console.error(
    "❌ Erro ao criar tabelas:",
    error
  );
});
/* =========================================================
   DADOS / ARQUIVOS
========================================================= */

const data =
  process.env.DATA_DIR
    ? process.env.DATA_DIR
    : path.join(root, "data");

const uploads =
  process.env.DATA_DIR
    ? path.join(
        process.env.DATA_DIR,
        "uploads"
      )
    : path.join(
        root,
        "uploads"
      );

const productsFile =
  path.join(
    data,
    "products.json"
  );

const ordersFile =
  path.join(
    data,
    "orders.json"
  );

/* =========================================================
   CONFIGURAÇÕES
========================================================= */

const FIXED_SHIPPING = 1500;
const MELHOR_ENVIO_TOKEN =
  process.env.MELHOR_ENVIO_TOKEN || "";

const SHIPPING_ORIGIN_CEP =
  "42821810";

const PAGBANK_TOKEN =
  process.env.PAGBANK_TOKEN || "";

const PAGBANK_ENV =
  process.env.PAGBANK_ENV ||
  "sandbox";

const PUBLIC_URL =
  process.env.PUBLIC_URL ||
  "https://hey-beauty.onrender.com";

const PAGBANK_BASE_URL =
  PAGBANK_ENV ===
  "production"
    ? "https://api.pagseguro.com"
    : "https://sandbox.api.pagseguro.com";

/* =========================================================
   CRIAR PASTAS
========================================================= */

fs.mkdirSync(
  data,
  {
    recursive: true,
  }
);

fs.mkdirSync(
  uploads,
  {
    recursive: true,
  }
);

if (
  !fs.existsSync(
    productsFile
  )
) {
  fs.writeFileSync(
    productsFile,
    "[]"
  );
}

if (
  !fs.existsSync(
    ordersFile
  )
) {
  fs.writeFileSync(
    ordersFile,
    "[]"
  );
}

/* =========================================================
   JSON
========================================================= */

const read = (file) => {
  try {
    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
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

const write = (
  file,
  value
) => {
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
  express.static(
    uploads
  )
);

/* =========================================================
   AUXILIARES
========================================================= */

const onlyNumbers = (
  value
) =>
  String(
    value || ""
  ).replace(
    /\D/g,
    ""
  );

const findOrder = (
  id
) => {
  const orders =
    read(
      ordersFile
    );

  const index =
    orders.findIndex(
      (order) =>
        String(
          order.id
        ) ===
        String(id)
    );

  return {
    orders,
    index,

    order:
      index >= 0
        ? orders[index]
        : null,
  };
};

const saveOrder = (
  orders,
  index,
  order
) => {
  orders[index] =
    order;

  write(
    ordersFile,
    orders
  );
};

const splitPhone = (
  phone
) => {
  let numbers =
    onlyNumbers(
      phone
    );

  if (
    numbers.startsWith(
      "55"
    )
  ) {
    numbers =
      numbers.slice(2);
  }

  const area =
    numbers.slice(
      0,
      2
    );

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

const buildCustomer = (
  order
) => {
  const customer = {
    name:
      order.customer_name,

    email:
      order.email,

    tax_id:
      onlyNumbers(
        order.cpf
      ),
  };

  const phone =
    splitPhone(
      order.phone
    );

  if (phone) {
    customer.phones = [
      phone,
    ];
  }

  return customer;
};

const buildPagBankItems = (
  order
) =>
  (
    order.items ||
    []
  ).map(
    (item) => ({
      reference_id:
        String(
          item.id
        ),

      name:
        String(
          item.name
        ).slice(
          0,
          100
        ),

      quantity:
        Number(
          item.quantity
        ),

      unit_amount:
        Number(
          item.unit_price
        ),
    })
  );

const buildShipping = (
  order
) => {
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
      street:
        order.street,

      number:
        String(
          order.number
        ),

      ...(order.complement
  ? {
      complement:
        order.complement,
    }
  : {}),

      locality:
        order.neighborhood ||
        "",

      city:
        order.city,

      region_code:
        String(
          order.state
        ).toUpperCase(),

      country:
        "BRA",

      postal_code:
        onlyNumbers(
          order.cep
        ),
    },
  };
};

/* =========================================================
   REQUEST PAGBANK
========================================================= */

const pagBankRequest =
  async (
    endpoint,
    options = {}
  ) => {
    if (
      !PAGBANK_TOKEN
    ) {
      throw new Error(
        "PAGBANK_TOKEN não configurado."
      );
    }

    const response =
      await fetch(
        PAGBANK_BASE_URL +
          endpoint,
        {
          ...options,

          headers: {
            Authorization:
              `Bearer ${PAGBANK_TOKEN}`,

            Accept:
              "application/json",

            "Content-Type":
              "application/json",

            ...(
              options.headers ||
              {}
            ),
          },
        }
      );

    const text =
      await response.text();

    let result = {};

    try {
      result =
        text
          ? JSON.parse(
              text
            )
          : {};
    } catch {
      result = {
        raw: text,
      };
    }

    if (
      !response.ok
    ) {
      console.error(
        "Erro PagBank:",
        response.status,
        result
      );

      const description =
        result
          ?.error_messages?.[0]
          ?.description ||
        result
          ?.error_messages?.[0]
          ?.message ||
        result?.message ||
        result?.error ||
        `Erro PagBank ${response.status}`;

      const error =
        new Error(
          description
        );

      error.status =
        response.status;

      error.pagbank =
        result;

      throw error;
    }

    return result;
  };

/* =========================================================
   ESTOQUE
========================================================= */

const decrementStockForOrder = (
  order
) => {
  if (
    order.stock_decremented
  ) {
    return order;
  }

  const products =
    read(
      productsFile
    );

  for (
    const item of
    order.items || []
  ) {
    const index =
      products.findIndex(
        (product) =>
          String(
            product.id
          ) ===
          String(
            item.id
          )
      );

    if (
      index < 0
    ) {
      continue;
    }

    const currentStock =
      Number(
        products[index]
          .stock || 0
      );

    const quantity =
      Number(
        item.quantity ||
        0
      );

    products[index].stock =
      Math.max(
        0,
        currentStock -
          quantity
      );
  }

  write(
    productsFile,
    products
  );

  return {
    ...order,

    stock_decremented:
      true,
  };
};

/* =========================================================
   LOGIN ADMIN
========================================================= */

function auth(
  req,
  res,
  next
) {
  const header =
    req.headers
      .authorization ||
    "";

  if (
    !header.startsWith(
      "Basic "
    )
  ) {
    return res
      .status(401)
      .json({
        error:
          "Não autorizado",
      });
  }

  const decoded =
    Buffer.from(
      header.slice(6),
      "base64"
    ).toString();

  const separator =
    decoded.indexOf(
      ":"
    );

  const user =
    decoded.slice(
      0,
      separator
    );

  const password =
    decoded.slice(
      separator + 1
    );

  const adminUser =
    process.env
      .ADMIN_USER ||
    "admin";

  const adminPassword =
    process.env
      .ADMIN_PASSWORD ||
    "troque-esta-senha";

  if (
    user !==
      adminUser ||
    password !==
      adminPassword
  ) {
    return res
      .status(401)
      .json({
        error:
          "Usuário ou senha inválidos",
      });
  }

  next();
}

/* =========================================================
   UPLOAD
========================================================= */

const upload =
  multer({
    storage:
      multer.diskStorage({
        destination: (
          req,
          file,
          callback
        ) => {
          callback(
            null,
            uploads
          );
        },

        filename: (
          req,
          file,
          callback
        ) => {
          callback(
            null,
            crypto.randomUUID() +
              path
                .extname(
                  file.originalname
                )
                .toLowerCase()
          );
        },
      }),
  });

/* =========================================================
   PRODUTOS PÚBLICOS
========================================================= */

app.get(
  "/api/products",
  (
    req,
    res
  ) => {
    const products =
      read(
        productsFile
      );

    res.json(
      products.filter(
        (product) =>
          product.active
      )
    );
  }
);

/* =========================================================
   PRODUTOS ADMIN
========================================================= */

app.get(
  "/api/admin/products",
  auth,
  (
    req,
    res
  ) => {
    res.json(
      read(
        productsFile
      )
    );
  }
);

/* =========================================================
   UPLOAD FOTO
========================================================= */

app.post(
  "/api/upload",
  auth,
  upload.single(
    "image"
  ),
  (
    req,
    res
  ) => {
    if (
      !req.file
    ) {
      return res
        .status(400)
        .json({
          error:
            "Imagem não enviada.",
        });
    }

    res.json({
      image:
        "/uploads/" +
        req.file.filename,
    });
  }
);

/* =========================================================
   CADASTRAR PRODUTO
========================================================= */

app.post(
  "/api/admin/products",
  auth,
  (
    req,
    res
  ) => {
    const products =
      read(
        productsFile
      );

    const body =
      req.body;

    const id =
      products.length
        ? Math.max(
            ...products.map(
              (product) =>
                Number(
                  product.id
                )
            )
          ) + 1
        : 1;

    const stock =
      Math.max(
        0,
        Number(
          body.stock ||
          0
        )
      );

    const product = {
      id,

      name:
        body.name ||
        "",

      description:
        body.description ||
        "",

      price:
        Math.round(
          Number(
            body.price ||
            0
          ) * 100
        ),

      stock,

      sizes:
        body.sizes ||
        "",

      colors:
        body.colors ||
        "",

      image:
        body.image ||
        "",

      active:
        body.active
          ? 1
          : 0,
    };

    products.unshift(
      product
    );

    write(
      productsFile,
      products
    );

    res.json({
      id,
      stock,
    });
  }
);

/* =========================================================
   EDITAR PRODUTO
========================================================= */

app.put(
  "/api/admin/products/:id",
  auth,
  (
    req,
    res
  ) => {
    const products =
      read(
        productsFile
      );

    const index =
      products.findIndex(
        (product) =>
          String(
            product.id
          ) ===
          String(
            req.params.id
          )
      );

    if (
      index < 0
    ) {
      return res
        .status(404)
        .json({
          error:
            "Produto não encontrado.",
        });
    }

    const current =
      products[index];

    let stock =
      Number(
        current.stock ||
        0
      );

    if (
      req.body.stock !==
        undefined &&
      req.body.stock !==
        null &&
      req.body.stock !==
        ""
    ) {
      stock =
        Math.max(
          0,
          Number(
            req.body.stock
          )
        );
    }

    const price =
      req.body.price !==
      undefined
        ? Math.round(
            Number(
              req.body.price ||
              0
            ) * 100
          )
        : current.price;

    products[index] = {
      ...current,

      name:
        req.body.name ??
        current.name,

      description:
        req.body
          .description ??
        current.description,

      price,

      stock,

      sizes:
        req.body.sizes ??
        current.sizes,

      colors:
        req.body.colors ??
        current.colors,

      image:
        req.body.image ??
        current.image,

      active:
        req.body.active
          ? 1
          : 0,
    };

    write(
      productsFile,
      products
    );

    res.json({
      ok: true,
      stock,
    });
  }
);

/* =========================================================
   EXCLUIR PRODUTO
========================================================= */

app.delete(
  "/api/admin/products/:id",
  auth,
  (
    req,
    res
  ) => {
    const products =
      read(
        productsFile
      );

    const filtered =
      products.filter(
        (product) =>
          String(
            product.id
          ) !==
          String(
            req.params.id
          )
      );

    write(
      productsFile,
      filtered
    );

    res.json({
      ok: true,
    });
  }
);

/* =========================================================
   PEDIDOS ADMIN
========================================================= */

app.get(
  "/api/orders",
  auth,
  (
    req,
    res
  ) => {
    res.json(
      read(
        ordersFile
      ).reverse()
    );
  }
);

/* =========================================================
   CHECKOUT
========================================================= */

app.post(
  "/api/checkout",
  (
    req,
    res
  ) => {
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
      !items?.length
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
      cpf.length !==
      11
    ) {
      return res
        .status(400)
        .json({
          error:
            "CPF inválido.",
        });
    }

    const allowedDelivery =
      [
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

    const products =
      read(
        productsFile
      );

    let subtotal = 0;

    const details = [];

    for (
      const item of items
    ) {
      const product =
        products.find(
          (product) =>
            String(
              product.id
            ) ===
              String(
                item.id
              ) &&
            product.active
        );

      const quantity =
        Number(
          item.quantity
        );

      if (
        !product
      ) {
        return res
          .status(400)
          .json({
            error:
              "Produto inválido.",
          });
      }

      if (
        quantity < 1 ||
        quantity >
          Number(
            product.stock ||
            0
          )
      ) {
        return res
          .status(400)
          .json({
            error:
              `Estoque insuficiente para ${product.name}. Disponível: ${product.stock}.`,
          });
      }

      subtotal +=
        Number(
          product.price
        ) *
        quantity;

      details.push({
        id:
          product.id,

        name:
          product.name,

        quantity,

        unit_price:
          Number(
            product.price
          ),

        size:
          item.size ||
          "",

        color:
          item.color ||
          "",
      });
    }

   let shippingFee = null;

let shippingStatus =
  "pending_quote";

let shippingService =
  null;

let shippingServiceId =
  null;

let shippingDeliveryTime =
  null;

/* ENTREGA FIXA */
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

/* CORREIOS / MELHOR ENVIO */
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
  shippingFee =
    null;

  shippingStatus =
    "pending_quote";
}

    const total =
      shippingFee ===
      null
        ? null
        : subtotal +
          shippingFee;

    const orders =
      read(
        ordersFile
      );

    const id =
      orders.length
        ? Math.max(
            ...orders.map(
              (order) =>
                Number(
                  order.id
                )
            )
          ) + 1
        : 1;

    const order = {
      id,

      customer_name:
        customer.name,

      cpf,

      email:
        customer.email,

      phone:
        customer.phone ||
        "",

      cep:
        customer.cep ||
        "",

      street:
        customer.street ||
        "",

      number:
        customer.number ||
        "",

      complement:
        customer.complement ||
        "",

      neighborhood:
        customer.neighborhood ||
        "",

      city:
        customer.city ||
        "",

      state:
        customer.state ||
        "",

      reference:
        customer.reference ||
        "",

      address:
        customer.address,

      
        delivery_method:
  delivery.method,

shipping_fee:
  shippingFee,

shipping_status:
  shippingStatus,

shipping_service:
  shippingService,

shipping_service_id:
  shippingServiceId,

shipping_delivery_time:
  shippingDeliveryTime,

subtotal,

total,

      items:
        details,

      payment_status:
        "pending",

      payment_method:
        null,

      stock_decremented:
        false,

      pagbank_order_id:
        null,

      pagbank_charge_id:
        null,

      created_at:
        new Date()
          .toISOString(),
    };

    orders.push(
      order
    );

    write(
      ordersFile,
      orders
    );

    res.json({
      orderId:
        id,

      subtotal,

      shippingFee,

      shippingStatus,

      total,

      deliveryMethod:
        delivery.method,
    });
  }
);

/* =========================================================
   PARCELAS / JUROS
========================================================= */

app.get(
  "/api/pagbank/installments",
  async (
    req,
    res
  ) => {
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
        bin.length !==
          6
      ) {
        return res
          .status(400)
          .json({
            error:
              "Informe o pedido e os 6 primeiros números do cartão.",
          });
      }

      const {
        order,
      } =
        findOrder(
          orderId
        );

      if (
        !order
      ) {
        return res
          .status(404)
          .json({
            error:
              "Pedido não encontrado.",
          });
      }

      if (
        order.total ==
        null
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

          max_installments_no_interest: 0,

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

      res.json({
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
        error.pagbank ||
          error
      );

      res
        .status(
          error.status ||
            500
        )
        .json({
          error:
            error.message ||
            "Erro ao calcular parcelas.",
        });
    }
  }
);

/* =========================================================
   PIX
========================================================= */

app.post(
  "/api/pagbank/pix",
  async (
    req,
    res
  ) => {
    try {
      const {
        orderId,
      } = req.body;

      const {
        orders,
        index,
        order,
      } =
        findOrder(
          orderId
        );

      if (
        !order
      ) {
        return res
          .status(404)
          .json({
            error:
              "Pedido não encontrado.",
          });
      }

      if (
        order.total ==
        null
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

      if (
        shipping
      ) {
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
          qr
            ?.expiration_date ||
          null,

        updated_at:
          new Date()
            .toISOString(),
      };

      saveOrder(
        orders,
        index,
        updatedOrder
      );

      res.json({
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
          qr
            ?.expiration_date ||
          null,

        message:
          "Pix gerado com sucesso.",
      });
    } catch (error) {
      console.error(
        "Erro Pix PagBank:",
        error.pagbank ||
          error
      );

      res
        .status(
          error.status ||
            500
        )
        .json({
          error:
            error.message ||
            "Erro ao gerar Pix.",
        });
    }
  }
);

/* =========================================================
   CARTÃO
========================================================= */

app.post(
  "/api/pagbank/card",
  async (
    req,
    res
  ) => {
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

      const {
        orders,
        index,
        order,
      } =
        findOrder(
          orderId
        );

      if (
        !order
      ) {
        return res
          .status(404)
          .json({
            error:
              "Pedido não encontrado.",
          });
      }

      if (
        order.total ==
        null
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
              installments
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
        cleanBin.length !==
        6
      ) {
        return res
          .status(400)
          .json({
            error:
              "Cartão inválido.",
          });
      }

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

          max_installments_no_interest: 0,

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

      if (
        shipping
      ) {
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
          status ===
          "PAID"
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
        status ===
        "PAID"
      ) {
        updatedOrder =
          decrementStockForOrder(
            updatedOrder
          );
      }

      saveOrder(
        orders,
        index,
        updatedOrder
      );

      res.json({
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
        error.pagbank ||
          error
      );

      res
        .status(
          error.status ||
            500
        )
        .json({
          error:
            error.message ||
            "Erro ao processar cartão.",
        });
    }
  }
);

/* =========================================================
   WEBHOOK PAGBANK
========================================================= */

app.post(
  "/api/pagbank/webhook",
  (
    req,
    res
  ) => {
    try {
      const payload =
        req.body;

      console.log(
        "Webhook PagBank:",
        JSON.stringify(
          payload
        )
      );

      const orders =
        read(
          ordersFile
        );

      let index =
        orders.findIndex(
          (order) =>
            order.pagbank_order_id ===
            payload?.id
        );

      if (
        index < 0 &&
        payload
          ?.reference_id
      ) {
        const match =
          String(
            payload.reference_id
          ).match(
            /(\d+)$/
          );

        if (
          match
        ) {
          index =
            orders.findIndex(
              (order) =>
                String(
                  order.id
                ) ===
                match[1]
            );
        }
      }

      if (
        index >= 0
      ) {
        let order =
          orders[index];

        const charge =
          payload
            ?.charges?.[0];

        if (
          charge?.status ===
          "PAID"
        ) {
          order.payment_status =
            "paid";

          order =
            decrementStockForOrder(
              order
            );
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

        order.updated_at =
          new Date()
            .toISOString();

        orders[index] =
          order;

        write(
          ordersFile,
          orders
        );
      }

      res.sendStatus(
        200
      );
    } catch (error) {
      console.error(
        "Erro webhook:",
        error
      );

      res.sendStatus(
        200
      );
    }
  }
);

/* =========================================================
   FRETE - MELHOR ENVIO / SEDEX
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
          height: 10,
          width: 20,
          length: 30,
          weight: 0.5,
        },
      };

      const response =
        await fetch(
          "https://melhorenvio.com.br/api/v2/me/shipment/calculate",
          {
            method: "POST",

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
        await response.json();

      if (!response.ok) {
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

      const correiosIds = [1, 2, 17];

const options = Array.isArray(data)
  ? data
      .filter((service) =>
        correiosIds.includes(
          Number(service.id)
        )
      )
      .filter(
        (service) =>
          !service.error &&
          service.price
      )
      .map((service) => ({
        serviceId:
          Number(service.id),

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
      }))
  : [];

if (!options.length) {
  return res
    .status(400)
    .json({
      error:
        "Nenhuma opção dos Correios disponível para este CEP.",
    });
}

options.sort(
  (a, b) =>
    a.price - b.price
);

res.json({
  options,
});
    } catch (error) {
      console.error(
        "Erro frete SEDEX:",
        error
      );

      res
        .status(500)
        .json({
          error:
            "Não foi possível calcular o SEDEX.",
        });
    }
  }
);

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

app.get(
  "/{*splat}",
  (
    req,
    res
  ) => {
    res.sendFile(
      path.join(
        clientDist,
        "index.html"
      )
    );
  }
);

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `HEY BEAUTY rodando na porta ${PORT}`
    );

    console.log(
      `PagBank: ${PAGBANK_ENV}`
    );
  }
);