const express =
  require("express");

const cors =
  require("cors");

const path =
  require("path");

const fs =
  require("fs");

const multer =
  require("multer");

const crypto =
  require("crypto");

require("dotenv").config({
  path: path.join(
    __dirname,
    "..",
    ".env"
  ),
});

const app = express();

const PORT =
  process.env.PORT || 3000;

const root =
  path.join(
    __dirname,
    ".."
  );

const uploads =
  path.join(
    root,
    "uploads"
  );

const data =
  path.join(
    root,
    "data"
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

const LOCAL_SHIPPING =
  1500;

/* =========================
   PASTAS
========================= */

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

/* =========================
   ARQUIVOS JSON
========================= */

const read = (file) =>
  JSON.parse(
    fs.readFileSync(
      file,
      "utf8"
    )
  );

const write = (
  file,
  value
) =>
  fs.writeFileSync(
    file,
    JSON.stringify(
      value,
      null,
      2
    )
  );

/* =========================
   MIDDLEWARE
========================= */

app.use(cors());

app.use(express.json());

app.use(
  "/uploads",
  express.static(
    uploads
  )
);

/* =========================
   ADMIN
========================= */

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

/* =========================
   UPLOAD
========================= */

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

/* =========================
   PRODUTOS PÚBLICOS
========================= */

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

/* =========================
   PRODUTOS ADMIN
========================= */

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

/* =========================
   UPLOAD DE IMAGEM
========================= */

app.post(
  "/api/upload",
  auth,
  upload.single(
    "image"
  ),
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

/* =========================
   CADASTRAR PRODUTO
========================= */

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

/* =========================
   EDITAR PRODUTO
========================= */

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

/* =========================
   EXCLUIR PRODUTO
========================= */

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

/* =========================
   PEDIDOS ADMIN
========================= */

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

/* =========================
   CHECKOUT
========================= */

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

      subtotal,

      total,

      items:
        details,

      payment_status:
        "pending",

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
      orderId: id,

      subtotal,

      shippingFee,

      shippingStatus,

      total,

      deliveryMethod:
        delivery.method,

      paymentMode:
        "pending",
    });
  }
);

/* =========================
   FRONTEND
========================= */

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

/* =========================
   SERVIDOR
========================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `HEY BEAUTY rodando na porta ${PORT}`
    );
  }
);