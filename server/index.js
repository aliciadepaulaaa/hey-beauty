const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const crypto = require("crypto");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

const app = express();

const PORT =
  process.env.PORT || 3000;

const root =
  path.join(__dirname, "..");

const uploads =
  path.join(root, "uploads");

const data =
  path.join(root, "data");

const productsFile =
  path.join(data, "products.json");

const ordersFile =
  path.join(data, "orders.json");

/* =========================================================
   CONFIGURAÇÕES
========================================================= */

const LOCAL_SHIPPING = 1500;

const PAGBANK_TOKEN =
  process.env.PAGBANK_TOKEN || "";

const PAGBANK_ENV =
  process.env.PAGBANK_ENV || "sandbox";

const PAGBANK_BASE_URL =
  PAGBANK_ENV === "production"
    ? "https://api.pagseguro.com"
    : "https://sandbox.api.pagseguro.com";

/* =========================================================
   CRIAR PASTAS
========================================================= */

fs.mkdirSync(
  uploads,
  {
    recursive: true,
  }
);

fs.mkdirSync(
  data,
  {
    recursive: true,
  }
);

if (
  !fs.existsSync(productsFile)
) {
  fs.writeFileSync(
    productsFile,
    "[]"
  );
}

if (
  !fs.existsSync(ordersFile)
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
  } catch {
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
   FUNÇÕES AUXILIARES
========================================================= */

const onlyNumbers = (value) =>
  String(value || "")
    .replace(/\D/g, "");

const findOrder = (id) => {
  const orders =
    read(ordersFile);

  const index =
    orders.findIndex(
      (order) =>
        String(order.id) ===
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
  orders[index] = order;

  write(
    ordersFile,
    orders
  );
};

const splitPhone = (phone) => {
  const numbers =
    onlyNumbers(phone);

  let normalized =
    numbers;

  if (
    normalized.startsWith("55")
  ) {
    normalized =
      normalized.slice(2);
  }

  const area =
    normalized.slice(0, 2);

  const number =
    normalized.slice(2);

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

const buildPagBankItems = (
  order
) => {
  return (
    order.items || []
  ).map((item) => ({
    reference_id:
      String(item.id),

    name:
      String(item.name)
        .slice(0, 100),

    quantity:
      Number(
        item.quantity
      ),

    unit_amount:
      Number(
        item.unit_price
      ),
  }));
};

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

      complement:
        order.complement || "",

      locality:
        order.neighborhood || "",

      city:
        order.city,

      region_code:
        order.state,

      country:
        "BRA",

      postal_code:
        onlyNumbers(
          order.cep
        ),
    },
  };
};

const pagBankRequest =
  async (
    endpoint,
    options = {}
  ) => {
    if (!PAGBANK_TOKEN) {
      throw new Error(
        "PAGBANK_TOKEN não configurado no servidor."
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
          ? JSON.parse(text)
          : {};
    } catch {
      result = {
        raw: text,
      };
    }

    if (!response.ok) {
      console.error(
        "Erro PagBank:",
        response.status,
        result
      );

      const description =
        result?.error_messages?.[0]
          ?.description ||
        result?.error_messages?.[0]
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
   AUTENTICAÇÃO ADMIN
========================================================= */

function auth(
  req,
  res,
  next
) {
  const header =
    req.headers
      .authorization || "";

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

  const adminUser =
    process.env.ADMIN_USER ||
    "admin";

  const adminPassword =
    process.env.ADMIN_PASSWORD ||
    "troque-esta-senha";

  if (
    user !== adminUser ||
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
  (req, res) => {
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
   ADMIN - PRODUTOS
========================================================= */

app.get(
  "/api/admin/products",
  auth,
  (req, res) => {
    res.json(
      read(
        productsFile
      )
    );
  }
);

app.post(
  "/api/upload",
  auth,
  upload.single("image"),
  (req, res) => {
    if (!req.file) {
      return res
        .status(400)
        .json({
          error:
            "Imagem não enviada",
        });
    }

    res.json({
      image:
        "/uploads/" +
        req.file.filename,
    });
  }
);

app.post(
  "/api/admin/products",
  auth,
  (req, res) => {
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
                product.id
            )
          ) + 1
        : 1;

    products.unshift({
      id,

      ...body,

      price:
        Math.round(
          Number(
            body.price
          ) * 100
        ),

      stock:
        Number(
          body.stock || 0
        ),

      active:
        body.active
          ? 1
          : 0,
    });

    write(
      productsFile,
      products
    );

    res.json({
      id,
    });
  }
);

app.put(
  "/api/admin/products/:id",
  auth,
  (req, res) => {
    const products =
      read(
        productsFile
      );

    const index =
      products.findIndex(
        (product) =>
          product.id ==
          req.params.id
      );

    if (index < 0) {
      return res
        .status(404)
        .json({
          error:
            "Produto não encontrado",
        });
    }

    products[index] = {
      ...products[index],

      ...req.body,

      price:
        Math.round(
          Number(
            req.body.price
          ) * 100
        ),

      stock:
        Number(
          req.body.stock || 0
        ),

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
    });
  }
);

app.delete(
  "/api/admin/products/:id",
  auth,
  (req, res) => {
    const products =
      read(
        productsFile
      );

    write(
      productsFile,

      products.filter(
        (product) =>
          product.id !=
          req.params.id
      )
    );

    res.json({
      ok: true,
    });
  }
);

/* =========================================================
   ADMIN - PEDIDOS
========================================================= */

app.get(
  "/api/orders",
  auth,
  (req, res) => {
    res.json(
      read(
        ordersFile
      ).reverse()
    );
  }
);

/* =========================================================
   CRIAR PEDIDO DA HEY BEAUTY
========================================================= */

app.post(
  "/api/checkout",
  (req, res) => {
    const {
      customer,
      items,
      delivery,
    } = req.body;

    if (
      !customer?.name ||
      !customer?.email ||
      !customer?.address ||
      !items?.length
    ) {
      return res
        .status(400)
        .json({
          error:
            "Dados incompletos",
        });
    }

    const allowedDelivery =
      [
        "hey_beauty",
        "customer_motoboy",
        "national",
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
            "Forma de entrega inválida",
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
            product.id ==
              item.id &&
            product.active
        );

      const quantity =
        Number(
          item.quantity
        );

      if (
        !product ||
        quantity < 1 ||
        quantity >
          product.stock
      ) {
        return res
          .status(400)
          .json({
            error:
              "Produto sem estoque ou inválido",
          });
      }

      subtotal +=
        product.price *
        quantity;

      details.push({
        id:
          product.id,

        name:
          product.name,

        quantity,

        unit_price:
          product.price,

        size:
          item.size || "",

        color:
          item.color || "",
      });
    }

    let shippingFee = 0;

    let shippingStatus =
      "calculated";

    if (
      delivery.method ===
      "hey_beauty"
    ) {
      shippingFee =
        LOCAL_SHIPPING;
    }

    if (
      delivery.method ===
      "customer_motoboy"
    ) {
      shippingFee = 0;
    }

    if (
      delivery.method ===
      "national"
    ) {
      shippingFee = null;

      shippingStatus =
        "pending_quote";
    }

    const total =
      shippingFee === null
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
                order.id
            )
          ) + 1
        : 1;

    const order = {
      id,

      customer_name:
        customer.name,

      email:
        customer.email,

      phone:
        customer.phone || "",

      cep:
        customer.cep || "",

      street:
        customer.street || "",

      number:
        customer.number || "",

      complement:
        customer.complement || "",

      neighborhood:
        customer.neighborhood || "",

      city:
        customer.city || "",

      state:
        customer.state || "",

      reference:
        customer.reference || "",

      address:
        customer.address,

      delivery_method:
        delivery.method,

      shipping_fee:
        shippingFee,

      shipping_status:
        shippingStatus,

      subtotal,

      total,

      items:
        details,

      payment_status:
        "pending",

      payment_method:
        null,

      pagbank_order_id:
        null,

      pagbank_charge_id:
        null,

      pagbank_qr_code:
        null,

      created_at:
        new Date()
          .toISOString(),
    };

    orders.push(order);

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
   PAGBANK - CARTÃO
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

      const parcelCount =
        Number(
          installments
        );

      if (
        !Number.isInteger(
          parcelCount
        ) ||
        parcelCount < 1 ||
        parcelCount > 12
      ) {
        return res
          .status(400)
          .json({
            error:
              "Parcelamento inválido.",
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

      if (!order) {
        return res
          .status(404)
          .json({
            error:
              "Pedido não encontrado.",
          });
      }

      if (
        order.shipping_status ===
        "pending_quote" ||
        order.total == null
      ) {
        return res
          .status(400)
          .json({
            error:
              "O frete nacional precisa ser definido antes do pagamento.",
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

      const phone =
        splitPhone(
          order.phone
        );

      const customer = {
        name:
          order.customer_name,

        email:
          order.email,
      };

      if (phone) {
        customer.phones = [
          phone,
        ];
      }

      const shipping =
        buildShipping(
          order
        );

      const payload = {
        reference_id:
          `HEY-BEAUTY-${order.id}`,

        customer,

        items:
          buildPagBankItems(
            order
          ),

        charges: [
          {
            reference_id:
              `HEY-BEAUTY-CHARGE-${order.id}`,

            description:
              `Pedido Hey Beauty #${order.id}`,

            amount: {
              value:
                Number(
                  order.total
                ),

              currency:
                "BRL",
            },

            payment_method: {
              type:
                "CREDIT_CARD",

              installments:
                parcelCount,

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

      if (shipping) {
        payload.shipping =
          shipping;
      }

      const pagbank =
        await pagBankRequest(
          "/orders",
          {
            method: "POST",

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

      const updatedOrder = {
        ...order,

        payment_method:
          "credit_card",

        payment_status:
          status === "PAID"
            ? "paid"
            : status.toLowerCase(),

        installments:
          parcelCount,

        pagbank_order_id:
          pagbank.id || null,

        pagbank_charge_id:
          charge?.id || null,

        pagbank_payment_response:
          charge
            ?.payment_response ||
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

        pagbankOrderId:
          pagbank.id,

        chargeId:
          charge?.id,

        status,

        message:
          charge
            ?.payment_response
            ?.message ||
          (
            status === "PAID"
              ? "Pagamento aprovado."
              : "Pagamento enviado para análise."
          ),

        brand:
          charge
            ?.payment_method
            ?.card
            ?.brand ||
          null,

        lastDigits:
          charge
            ?.payment_method
            ?.card
            ?.last_digits ||
          null,
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

          details:
            error.pagbank ||
            undefined,
        });
    }
  }
);

/* =========================================================
   PAGBANK - PIX
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

      if (!orderId) {
        return res
          .status(400)
          .json({
            error:
              "Pedido não informado.",
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

      if (!order) {
        return res
          .status(404)
          .json({
            error:
              "Pedido não encontrado.",
          });
      }

      if (
        order.shipping_status ===
        "pending_quote" ||
        order.total == null
      ) {
        return res
          .status(400)
          .json({
            error:
              "O frete nacional precisa ser definido antes do pagamento.",
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

      const phone =
        splitPhone(
          order.phone
        );

      const customer = {
        name:
          order.customer_name,

        email:
          order.email,
      };

      if (phone) {
        customer.phones = [
          phone,
        ];
      }

      const shipping =
        buildShipping(
          order
        );

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

        customer,

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
      };

      if (shipping) {
        payload.shipping =
          shipping;
      }

      const pagbank =
        await pagBankRequest(
          "/orders",
          {
            method: "POST",

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

      const base64Link =
        qr?.links?.find(
          (link) =>
            link.media ===
            "text/plain"
        );

      const updatedOrder = {
        ...order,

        payment_method:
          "pix",

        payment_status:
          "waiting_payment",

        pagbank_order_id:
          pagbank.id || null,

        pagbank_qr_code_id:
          qr?.id || null,

        pagbank_qr_code:
          qr?.text || null,

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

      saveOrder(
        orders,
        index,
        updatedOrder
      );

      res.json({
        ok: true,

        orderId:
          order.id,

        pagbankOrderId:
          pagbank.id,

        status:
          "WAITING_PAYMENT",

        qrCode:
          qr?.text || null,

        qrCodeImage:
          imageLink?.href ||
          null,

        qrCodeBase64:
          base64Link?.href ||
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

          details:
            error.pagbank ||
            undefined,
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

      const pagbankOrderId =
        payload?.id;

      const referenceId =
        payload
          ?.reference_id;

      const orders =
        read(
          ordersFile
        );

      let index = -1;

      if (pagbankOrderId) {
        index =
          orders.findIndex(
            (order) =>
              order.pagbank_order_id ===
              pagbankOrderId
          );
      }

      if (
        index < 0 &&
        referenceId
      ) {
        const match =
          String(
            referenceId
          ).match(
            /(\d+)$/
          );

        if (match) {
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

      if (index >= 0) {
        const order =
          orders[index];

        const charge =
          payload
            ?.charges?.[0];

        if (charge) {
          order.payment_status =
            charge.status ===
            "PAID"
              ? "paid"
              : String(
                  charge.status ||
                  "pending"
                ).toLowerCase();

          order.pagbank_charge_id =
            charge.id ||
            order.pagbank_charge_id;
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

      res.sendStatus(200);

    } catch (error) {
      console.error(
        "Erro webhook:",
        error
      );

      res.sendStatus(200);
    }
  }
);

/* =========================================================
   FRONTEND PRODUÇÃO
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
   SERVIDOR
========================================================= */

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