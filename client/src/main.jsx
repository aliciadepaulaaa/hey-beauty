import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useParams,
} from "react-router-dom";
import "./style.css";

const API_URL = "http://localhost:3000";

/* =========================
   FORMATAÇÃO DE PREÇO
========================= */

const money = (value) => {
  return (Number(value || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

/*
  O servidor salva o preço em CENTAVOS.

  Exemplos:
  80       -> servidor salva 8000
  80,00    -> servidor salva 8000
  129,90   -> servidor salva 12990
*/
const parsePrice = (value) => {
  if (typeof value === "number") {
    return value;
  }

  let text = String(value ?? "").trim();

  if (!text) {
    return 0;
  }

  text = text.replace(/\s/g, "");

  // Exemplo: 1.299,90
  if (text.includes(",") && text.includes(".")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    // Exemplo: 80,00
    text = text.replace(",", ".");
  }

  const number = Number(text);

  return Number.isFinite(number) ? number : 0;
};

/* =========================
   IMAGENS
========================= */

const imageUrl = (image) => {
  if (!image) {
    return "";
  }

  if (
    image.startsWith("http://") ||
    image.startsWith("https://")
  ) {
    return image;
  }

  if (image.startsWith("/")) {
    return API_URL + image;
  }

  return API_URL + "/" + image;
};

/* =========================
   API
========================= */

const api = async (url, options = {}) => {
  const finalUrl = url.startsWith("http")
    ? url
    : API_URL + url;

  const response = await fetch(finalUrl, options);

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || "Ocorreu um erro."
    );
  }

  return data;
};

/* =========================
   APP
========================= */

function App() {
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem("cart") || "[]"
      );
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(
      "cart",
      JSON.stringify(cart)
    );
  }, [cart]);

  const addToCart = (
    product,
    size = "",
    color = ""
  ) => {
    setCart((currentCart) => {
      const existingIndex =
        currentCart.findIndex(
          (item) =>
            item.id === product.id &&
            item.size === size &&
            item.color === color
        );

      if (existingIndex >= 0) {
        const updated = [...currentCart];

        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity:
            updated[existingIndex].quantity + 1,
        };

        return updated;
      }

      return [
        ...currentCart,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          size,
          color,
          quantity: 1,
        },
      ];
    });
  };

  const removeFromCart = (index) => {
    setCart((currentCart) =>
      currentCart.filter(
        (_, i) => i !== index
      )
    );
  };

  return (
    <>
      <header>
        <Link
          className="brand"
          to="/"
        >
          HEY BEAUTY
        </Link>

        <nav>
          <Link to="/">
            Produtos
          </Link>

          <Link to="/carrinho">
            Carrinho (
            {cart.reduce(
              (total, item) =>
                total + item.quantity,
              0
            )}
            )
          </Link>

          <Link to="/admin">
            Admin
          </Link>
        </nav>
      </header>

      <Routes>
        <Route
          path="/"
          element={<Home />}
        />

        <Route
          path="/produto/:id"
          element={
            <ProductPage
              addToCart={addToCart}
            />
          }
        />

        <Route
          path="/carrinho"
          element={
            <Cart
              cart={cart}
              removeFromCart={
                removeFromCart
              }
            />
          }
        />

        <Route
          path="/checkout"
          element={
            <Checkout
              cart={cart}
              setCart={setCart}
            />
          }
        />

        <Route
          path="/admin"
          element={<Admin />}
        />
      </Routes>
    </>
  );
}

/* =========================
   HOME
========================= */

function Home() {
  const [products, setProducts] =
    useState([]);

  const [error, setError] =
    useState("");

  useEffect(() => {
    api("/api/products")
      .then((data) => {
        /*
          Proteção contra products.map
          caso a API retorne objeto em vez de array.
        */
        if (Array.isArray(data)) {
          setProducts(data);
        } else {
          setProducts([]);
          console.error(
            "A API não retornou uma lista:",
            data
          );
        }
      })
      .catch((error) => {
        console.error(error);
        setError(error.message);
      });
  }, []);

  return (
    <main>
      <section className="hero">
        <div>
          <span>HEY BEAUTY</span>

          <h1>
            Seu estilo começa aqui.
          </h1>

          <p>
            Escolha suas peças favoritas
            e encontre seu próximo look.
          </p>

          <a
            href="#produtos"
            className="btn"
          >
            Ver produtos
          </a>
        </div>
      </section>

      <section
        id="produtos"
        className="section"
      >
        <h2>
          Nossos produtos
        </h2>

        {error && (
          <p className="notice">
            {error}
          </p>
        )}

        <div className="grid">
          {products.map((product) => (
            <article
              className="card"
              key={product.id}
            >
              {product.image ? (
                <img
                  src={imageUrl(
                    product.image
                  )}
                  alt={product.name}
                />
              ) : (
                <div className="placeholder">
                  FOTO DA PEÇA
                </div>
              )}

              <div className="cardbody">
                <h3>
                  {product.name}
                </h3>

                <p>
                  {product.description}
                </p>

                <strong>
                  {money(product.price)}
                </strong>

                <Link
                  className="btn full"
                  to={`/produto/${product.id}`}
                >
                  Ver detalhes
                </Link>
              </div>
            </article>
          ))}
        </div>

        {!products.length &&
          !error && (
            <p>
              Nenhum produto
              cadastrado.
            </p>
          )}
      </section>
    </main>
  );
}

/* =========================
   PRODUTO
========================= */

function ProductPage({
  addToCart,
}) {
  const { id } =
    useParams();

  return (
    <Product
      id={id}
      addToCart={addToCart}
    />
  );
}

function Product({
  id,
  addToCart,
}) {
  const [product, setProduct] =
    useState(null);

  const [size, setSize] =
    useState("");

  const [color, setColor] =
    useState("");

  useEffect(() => {
    api("/api/products")
      .then((data) => {
        if (!Array.isArray(data)) {
          return;
        }

        const found =
          data.find(
            (item) =>
              item.id == id
          );

        setProduct(found || null);
      })
      .catch(console.error);
  }, [id]);

  if (!product) {
    return (
      <main className="section">
        <p>
          Carregando produto...
        </p>
      </main>
    );
  }

  return (
    <main className="section product">
      <div>
        {product.image ? (
          <img
            src={imageUrl(
              product.image
            )}
            alt={product.name}
          />
        ) : (
          <div className="placeholder big">
            FOTO
          </div>
        )}
      </div>

      <div>
        <h1>
          {product.name}
        </h1>

        <h2>
          {money(product.price)}
        </h2>

        <p>
          {product.description}
        </p>

        {product.sizes && (
          <>
            <label>
              Tamanho
            </label>

            <select
              value={size}
              onChange={(event) =>
                setSize(
                  event.target.value
                )
              }
            >
              <option value="">
                Selecione
              </option>

              {product.sizes
                .split(",")
                .map((item) => (
                  <option
                    key={item}
                    value={item}
                  >
                    {item}
                  </option>
                ))}
            </select>
          </>
        )}

        {product.colors && (
          <>
            <label>
              Cor
            </label>

            <select
              value={color}
              onChange={(event) =>
                setColor(
                  event.target.value
                )
              }
            >
              <option value="">
                Selecione
              </option>

              {product.colors
                .split(",")
                .map((item) => (
                  <option
                    key={item}
                    value={item}
                  >
                    {item}
                  </option>
                ))}
            </select>
          </>
        )}

        <button
          className="btn full"
          onClick={() =>
            addToCart(
              product,
              size,
              color
            )
          }
        >
          Adicionar ao carrinho
        </button>
      </div>
    </main>
  );
}

/* =========================
   CARRINHO
========================= */

function Cart({
  cart,
  removeFromCart,
}) {
  const total =
    cart.reduce(
      (sum, item) =>
        sum +
        item.price *
          item.quantity,
      0
    );

  return (
    <main className="section">
      <h1>
        Seu carrinho
      </h1>

      {!cart.length ? (
        <p>
          Seu carrinho está vazio.
        </p>
      ) : (
        <>
          <div className="cart">
            {cart.map(
              (item, index) => (
                <div
                  className="cartrow"
                  key={index}
                >
                  <div>
                    <b>
                      {item.name}
                    </b>

                    <small>
                      {item.size &&
                        `Tamanho: ${item.size} `}

                      {item.color &&
                        `Cor: ${item.color}`}

                      {" · "}

                      {item.quantity}x
                    </small>
                  </div>

                  <strong>
                    {money(
                      item.price *
                        item.quantity
                    )}
                  </strong>

                  <button
                    onClick={() =>
                      removeFromCart(
                        index
                      )
                    }
                  >
                    Excluir
                  </button>
                </div>
              )
            )}
          </div>

          <div className="total">
            Total:{" "}
            {money(total)}
          </div>

          <Link
            className="btn"
            to="/checkout"
          >
            Finalizar compra
          </Link>
        </>
      )}
    </main>
  );
}

/* =========================
   CHECKOUT
========================= */

function Checkout({
  cart,
  setCart,
}) {
  const [form, setForm] =
    useState({
      name: "",
      email: "",
      phone: "",
      address: "",
    });

  const [message, setMessage] =
    useState("");

  const total =
    cart.reduce(
      (sum, item) =>
        sum +
        item.price *
          item.quantity,
      0
    );

  async function submit(
    event
  ) {
    event.preventDefault();

    setMessage(
      "Criando pedido..."
    );

    try {
      const data = await api(
        "/api/checkout",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            customer: form,
            items: cart,
          }),
        }
      );

      if (data.paymentUrl) {
        window.location.href =
          data.paymentUrl;
      } else {
        setMessage(
          `Pedido #${data.orderId} criado.`
        );

        setCart([]);
      }
    } catch (error) {
      setMessage(
        error.message
      );
    }
  }

  if (!cart.length) {
    return (
      <main className="section">
        <h1>
          Carrinho vazio
        </h1>

        <Link to="/">
          Voltar para a loja
        </Link>
      </main>
    );
  }

  return (
    <main className="section checkout">
      <div>
        <h1>
          Finalizar compra
        </h1>

        <form
          onSubmit={submit}
        >
          <input
            required
            placeholder="Nome completo"
            value={form.name}
            onChange={(event) =>
              setForm({
                ...form,
                name:
                  event.target
                    .value,
              })
            }
          />

          <input
            required
            type="email"
            placeholder="E-mail"
            value={form.email}
            onChange={(event) =>
              setForm({
                ...form,
                email:
                  event.target
                    .value,
              })
            }
          />

          <input
            placeholder="Telefone"
            value={form.phone}
            onChange={(event) =>
              setForm({
                ...form,
                phone:
                  event.target
                    .value,
              })
            }
          />

          <input
            required
            placeholder="Endereço completo"
            value={form.address}
            onChange={(event) =>
              setForm({
                ...form,
                address:
                  event.target
                    .value,
              })
            }
          />

          <button className="btn full">
            Finalizar pedido ·{" "}
            {money(total)}
          </button>
        </form>

        {message && (
          <p className="notice">
            {message}
          </p>
        )}
      </div>

      <aside>
        <h3>
          Resumo
        </h3>

        {cart.map(
          (item, index) => (
            <p key={index}>
              {item.quantity}x{" "}
              {item.name}

              <span>
                {money(
                  item.price *
                    item.quantity
                )}
              </span>
            </p>
          )
        )}

        <hr />

        <b>
          Total

          <span>
            {money(total)}
          </span>
        </b>
      </aside>
    </main>
  );
}

/* =========================
   ADMIN
========================= */

function Admin() {
  const [credentials, setCredentials] =
    useState(() =>
      localStorage.getItem(
        "adminCred"
      ) || ""
    );

  const [products, setProducts] =
    useState([]);

  const [orders, setOrders] =
    useState([]);

  const [message, setMessage] =
    useState("");

  const [editingId, setEditingId] =
    useState(null);

  const [form, setForm] =
    useState({
      name: "",
      description: "",
      price: "",
      stock: 0,
      sizes: "P,M,G",
      colors: "",
      image: "",
      active: true,
    });

  const headers = () => {
    return credentials
      ? {
          Authorization:
            "Basic " +
            credentials,
        }
      : {};
  };

  const loadData =
    async () => {
      try {
        const productsData =
          await api(
            "/api/admin/products",
            {
              headers:
                headers(),
            }
          );

        /*
          Corrige definitivamente
          o erro products.map.
        */
        setProducts(
          Array.isArray(
            productsData
          )
            ? productsData
            : []
        );

        try {
          const ordersData =
            await api(
              "/api/orders",
              {
                headers:
                  headers(),
              }
            );

          setOrders(
            Array.isArray(
              ordersData
            )
              ? ordersData
              : []
          );
        } catch {
          setOrders([]);
        }
      } catch (error) {
        console.error(error);
        setMessage(
          error.message
        );
      }
    };

  useEffect(() => {
    if (credentials) {
      loadData();
    }
  }, [credentials]);

  /* =========================
     LOGIN
  ========================= */

  if (!credentials) {
    return (
      <main className="section admin">
        <h1>
          Painel administrativo
        </h1>

        <p>
          Entre com o usuário e
          senha do arquivo .env.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();

            const user =
              event.target.user
                .value;

            const password =
              event.target.password
                .value;

            const encoded =
              btoa(
                `${user}:${password}`
              );

            setCredentials(
              encoded
            );

            localStorage.setItem(
              "adminCred",
              encoded
            );
          }}
        >
          <input
            name="user"
            placeholder="Usuário"
            defaultValue="admin"
          />

          <input
            name="password"
            type="password"
            placeholder="Senha"
          />

          <button className="btn">
            Entrar
          </button>
        </form>
      </main>
    );
  }

  /* =========================
     LIMPAR FORMULÁRIO
  ========================= */

  const clearForm = () => {
    setEditingId(null);

    setForm({
      name: "",
      description: "",
      price: "",
      stock: 0,
      sizes: "P,M,G",
      colors: "",
      image: "",
      active: true,
    });
  };

  /* =========================
     UPLOAD DA FOTO
  ========================= */

  const uploadImage =
    async (event) => {
      const file =
        event.target.files?.[0];

      if (!file) {
        return;
      }

      try {
        setMessage(
          "Enviando foto..."
        );

        const formData =
          new FormData();

        formData.append(
          "image",
          file
        );

        const data =
          await api(
            "/api/upload",
            {
              method: "POST",
              headers:
                headers(),
              body: formData,
            }
          );

        setForm(
          (current) => ({
            ...current,
            image:
              data.image,
          })
        );

        setMessage(
          "Foto enviada com sucesso!"
        );
      } catch (error) {
        console.error(error);

        setMessage(
          error.message
        );
      }
    };

  /* =========================
     SALVAR PRODUTO
  ========================= */

  const saveProduct =
    async (event) => {
      event.preventDefault();

      try {
        const price =
          parsePrice(
            form.price
          );

        if (
          !Number.isFinite(
            price
          ) ||
          price < 0
        ) {
          throw new Error(
            "Digite um preço válido."
          );
        }

        const body = {
          name: form.name,
          description:
            form.description,
          /*
            IMPORTANTE:
            Não multiplicamos por 100 aqui.

            O servidor já faz:
            Number(b.price) * 100
          */
          price: price,
          stock: Number(
            form.stock || 0
          ),
          sizes: form.sizes,
          colors: form.colors,
          image: form.image,
          active: form.active
            ? 1
            : 0,
        };

        const url =
          editingId
            ? `/api/admin/products/${editingId}`
            : "/api/admin/products";

        await api(url, {
          method:
            editingId
              ? "PUT"
              : "POST",

          headers: {
            ...headers(),
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify(
            body
          ),
        });

        setMessage(
          "Produto salvo com sucesso!"
        );

        clearForm();

        await loadData();
      } catch (error) {
        console.error(error);

        setMessage(
          error.message
        );
      }
    };

  /* =========================
     EDITAR PRODUTO
  ========================= */

  const editProduct =
    (product) => {
      setEditingId(
        product.id
      );

      setForm({
        name:
          product.name || "",

        description:
          product.description ||
          "",

        /*
          Banco:
          8000 centavos

          Campo:
          80,00
        */
        price: (
          Number(
            product.price || 0
          ) / 100
        )
          .toFixed(2)
          .replace(".", ","),

        stock:
          Number(
            product.stock || 0
          ),

        sizes:
          product.sizes || "",

        colors:
          product.colors || "",

        image:
          product.image || "",

        active:
          Boolean(
            product.active
          ),
      });

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    };

  /* =========================
     EXCLUIR
  ========================= */

  const deleteProduct =
    async (id) => {
      const confirmed =
        window.confirm(
          "Deseja realmente excluir este produto?"
        );

      if (!confirmed) {
        return;
      }

      try {
        await api(
          `/api/admin/products/${id}`,
          {
            method: "DELETE",
            headers:
              headers(),
          }
        );

        setMessage(
          "Produto excluído."
        );

        await loadData();
      } catch (error) {
        console.error(error);

        setMessage(
          error.message
        );
      }
    };

  /* =========================
     SAIR
  ========================= */

  const logout = () => {
    localStorage.removeItem(
      "adminCred"
    );

    setCredentials("");
  };

  return (
    <main className="section admin">
      <div className="adminhead">
        <h1>
          Painel HEY BEAUTY
        </h1>

        <button
          onClick={logout}
        >
          Sair
        </button>
      </div>

      {/* =========================
          FORMULÁRIO
      ========================= */}

      <form
        className="panel"
        onSubmit={
          saveProduct
        }
      >
        <h2>
          {editingId
            ? "Editar peça"
            : "Cadastrar nova peça"}
        </h2>

        <input
          required
          placeholder="Nome da peça"
          value={form.name}
          onChange={(event) =>
            setForm({
              ...form,
              name:
                event.target
                  .value,
            })
          }
        />

        <textarea
          placeholder="Descrição da peça"
          value={
            form.description
          }
          onChange={(event) =>
            setForm({
              ...form,
              description:
                event.target
                  .value,
            })
          }
        />

        <input
          required
          type="text"
          inputMode="decimal"
          placeholder="Preço (ex.: 80,00)"
          value={form.price}
          onChange={(event) =>
            setForm({
              ...form,
              price:
                event.target
                  .value,
            })
          }
        />

        <input
          type="number"
          min="0"
          placeholder="Estoque"
          value={form.stock}
          onChange={(event) =>
            setForm({
              ...form,
              stock:
                event.target
                  .value,
            })
          }
        />

        <input
          placeholder="Tamanhos: P,M,G"
          value={form.sizes}
          onChange={(event) =>
            setForm({
              ...form,
              sizes:
                event.target
                  .value,
            })
          }
        />

        <input
          placeholder="Cores: Preto,Branco"
          value={form.colors}
          onChange={(event) =>
            setForm({
              ...form,
              colors:
                event.target
                  .value,
            })
          }
        />

        <label>
          Foto da peça
        </label>

        <input
          type="file"
          accept="image/*"
          onChange={
            uploadImage
          }
        />

        {/* PRÉ-VISUALIZAÇÃO */}

        {form.image && (
          <div
            style={{
              marginTop:
                "15px",
              marginBottom:
                "15px",
            }}
          >
            <p>
              Pré-visualização:
            </p>

            <img
              src={imageUrl(
                form.image
              )}
              alt={
                form.name ||
                "Foto da peça"
              }
              style={{
                width: "180px",
                height:
                  "230px",
                objectFit:
                  "cover",
                borderRadius:
                  "10px",
                display:
                  "block",
              }}
              onError={(event) => {
                console.error(
                  "Erro ao carregar imagem:",
                  form.image
                );

                event.currentTarget.style.display =
                  "none";
              }}
            />
          </div>
        )}

        <button
          type="submit"
          className="btn"
        >
          {editingId
            ? "Atualizar peça"
            : "Cadastrar peça"}
        </button>

        {editingId && (
          <button
            type="button"
            onClick={
              clearForm
            }
          >
            Cancelar edição
          </button>
        )}
      </form>

      {/* =========================
          MENSAGEM
      ========================= */}

      {message && (
        <p className="notice">
          {message}
        </p>
      )}

      {/* =========================
          PRODUTOS
      ========================= */}

      <section>
        <h2>
          Peças cadastradas
        </h2>

        <div className="adminlist">
          {products.map(
            (product) => (
              <div
                key={
                  product.id
                }
                style={{
                  display:
                    "flex",
                  alignItems:
                    "center",
                  gap: "15px",
                  marginBottom:
                    "15px",
                }}
              >
                {product.image ? (
                  <img
                    src={imageUrl(
                      product.image
                    )}
                    alt={
                      product.name
                    }
                    style={{
                      width:
                        "70px",
                      height:
                        "90px",
                      objectFit:
                        "cover",
                      borderRadius:
                        "8px",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width:
                        "70px",
                      height:
                        "90px",
                      display:
                        "flex",
                      alignItems:
                        "center",
                      justifyContent:
                        "center",
                      background:
                        "#eeeeee",
                      borderRadius:
                        "8px",
                      fontSize:
                        "11px",
                    }}
                  >
                    Sem foto
                  </div>
                )}

                <div
                  style={{
                    flex: 1,
                  }}
                >
                  <b>
                    {
                      product.name
                    }
                  </b>

                  <span
                    style={{
                      display:
                        "block",
                    }}
                  >
                    {money(
                      product.price
                    )}

                    {" · "}

                    estoque{" "}
                    {
                      product.stock
                    }
                  </span>
                </div>

                <button
                  onClick={() =>
                    editProduct(
                      product
                    )
                  }
                >
                  Editar
                </button>

                <button
                  onClick={() =>
                    deleteProduct(
                      product.id
                    )
                  }
                >
                  Excluir
                </button>
              </div>
            )
          )}
        </div>
      </section>

      {/* =========================
          PEDIDOS
      ========================= */}

      <section>
        <h2>
          Pedidos
        </h2>

        <div className="adminlist">
          {orders.map(
            (order) => (
              <div
                key={
                  order.id
                }
              >
                <b>
                  Pedido #
                  {
                    order.id
                  }
                </b>

                <span>
                  {
                    order.customer_name
                  }

                  {" · "}

                  {money(
                    order.total
                  )}

                  {" · "}

                  {
                    order.payment_status
                  }
                </span>
              </div>
            )
          )}

          {!orders.length && (
            <p>
              Nenhum pedido
              ainda.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

/* =========================
   INICIALIZAÇÃO
========================= */

createRoot(
  document.getElementById(
    "root"
  )
).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);