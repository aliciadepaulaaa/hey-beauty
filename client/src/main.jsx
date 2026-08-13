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

/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const API_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "";

const LOCAL_SHIPPING = 1500;

/* =========================================================
   FUNÇÕES
========================================================= */

const money = (value) =>
  (Number(value || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const parsePrice = (value) => {
  if (typeof value === "number") return value;

  let text = String(value ?? "").trim();

  if (!text) return 0;

  text = text.replace(/\s/g, "");

  if (text.includes(",") && text.includes(".")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    text = text.replace(",", ".");
  }

  const number = Number(text);

  return Number.isFinite(number) ? number : 0;
};

const imageUrl = (image) => {
  if (!image) return "";

  if (
    image.startsWith("http://") ||
    image.startsWith("https://")
  ) {
    return image;
  }

  return API_URL + image;
};

const api = async (url, options = {}) => {
  const finalUrl =
    url.startsWith("http")
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

/* =========================================================
   APP
========================================================= */

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
      const index = currentCart.findIndex(
        (item) =>
          item.id === product.id &&
          item.size === size &&
          item.color === color
      );

      if (index >= 0) {
        const updated = [...currentCart];

        updated[index] = {
          ...updated[index],
          quantity:
            updated[index].quantity + 1,
        };

        return updated;
      }

      return [
        ...currentCart,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.image || "",
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
        <Link className="brand" to="/">
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
              removeFromCart={removeFromCart}
            />
          }
        />

        <Route
          path="/checkout"
          element={
            <Checkout cart={cart} />
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

/* =========================================================
   HOME
========================================================= */

function Home() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/products")
      .then((data) => {
        setProducts(
          Array.isArray(data)
            ? data
            : []
        );
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
            Escolha suas peças favoritas e
            encontre seu próximo look.
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
        <h2>Nossos produtos</h2>

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
                  src={imageUrl(product.image)}
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
      </section>
    </main>
  );
}

/* =========================================================
   PRODUTO
========================================================= */

function ProductPage({ addToCart }) {
  const { id } = useParams();

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

  const [message, setMessage] =
    useState("");

  useEffect(() => {
    api("/api/products")
      .then((data) => {
        if (!Array.isArray(data)) return;

        const found = data.find(
          (item) => item.id == id
        );

        setProduct(found || null);
      })
      .catch(console.error);
  }, [id]);

  if (!product) {
    return (
      <main className="section">
        Carregando produto...
      </main>
    );
  }

  const add = () => {
    if (product.sizes && !size) {
      setMessage(
        "Selecione o tamanho."
      );
      return;
    }

    if (product.colors && !color) {
      setMessage(
        "Selecione a cor."
      );
      return;
    }

    addToCart(
      product,
      size,
      color
    );

    setMessage(
      "Produto adicionado ao carrinho!"
    );
  };

  return (
    <main className="section product">
      <div>
        {product.image ? (
          <img
            src={imageUrl(product.image)}
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
              onChange={(e) =>
                setSize(e.target.value)
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
              onChange={(e) =>
                setColor(e.target.value)
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
          onClick={add}
        >
          Adicionar ao carrinho
        </button>

        {message && (
          <p className="notice">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}

/* =========================================================
   CARRINHO
========================================================= */

function Cart({
  cart,
  removeFromCart,
}) {
  const total = cart.reduce(
    (sum, item) =>
      sum +
      item.price * item.quantity,
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
                      removeFromCart(index)
                    }
                  >
                    Excluir
                  </button>
                </div>
              )
            )}
          </div>

          <div className="total">
            Total: {money(total)}
          </div>

          <Link
            className="btn"
            to="/checkout"
          >
            Continuar para entrega
          </Link>
        </>
      )}
    </main>
  );
}

/* =========================================================
   CHECKOUT
========================================================= */

function Checkout({ cart }) {
  const [form, setForm] =
    useState({
      name: "",
      email: "",
      phone: "",

      cep: "",
      street: "",
      number: "",
      complement: "",
      neighborhood: "",
      city: "",
      state: "",
      reference: "",

      deliveryMethod: "",
    });

  const [message, setMessage] =
    useState("");

  const [orderId, setOrderId] =
    useState(null);

  const [loading, setLoading] =
    useState(false);

  const subtotal = cart.reduce(
    (sum, item) =>
      sum +
      item.price * item.quantity,
    0
  );

  const shipping =
    form.deliveryMethod ===
    "hey_beauty"
      ? LOCAL_SHIPPING
      : 0;

  const nationalShippingPending =
    form.deliveryMethod ===
    "national";

  const total =
    subtotal + shipping;

  const updateField = (
    field,
    value
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const submit =
    async (event) => {
      event.preventDefault();

      if (!form.deliveryMethod) {
        setMessage(
          "Escolha a forma de entrega."
        );

        return;
      }

      setLoading(true);

      setMessage(
        "Criando pedido..."
      );

      const completeAddress = [
        form.street,
        form.number &&
          `nº ${form.number}`,
        form.complement,
        form.neighborhood,
        form.city,
        form.state,
        form.cep &&
          `CEP ${form.cep}`,
      ]
        .filter(Boolean)
        .join(", ");

      try {
        const data =
          await api(
            "/api/checkout",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  customer: {
                    name:
                      form.name,

                    email:
                      form.email,

                    phone:
                      form.phone,

                    address:
                      completeAddress,

                    cep:
                      form.cep,

                    street:
                      form.street,

                    number:
                      form.number,

                    complement:
                      form.complement,

                    neighborhood:
                      form.neighborhood,

                    city:
                      form.city,

                    state:
                      form.state,

                    reference:
                      form.reference,
                  },

                  delivery: {
                    method:
                      form.deliveryMethod,

                    shipping:
                      nationalShippingPending
                        ? null
                        : shipping,
                  },

                  items: cart,
                }),
            }
          );

        setOrderId(
          data.orderId
        );

        if (
          form.deliveryMethod ===
          "national"
        ) {
          setMessage(
            `Pedido #${data.orderId} criado. O frete para seu CEP será calculado antes do pagamento.`
          );
        } else {
          setMessage(
            `Pedido #${data.orderId} criado com sucesso.`
          );
        }
      } catch (error) {
        setMessage(
          error.message
        );
      } finally {
        setLoading(false);
      }
    };

  if (!cart.length) {
    return (
      <main className="section">
        <h1>
          Carrinho vazio
        </h1>

        <Link
          className="btn"
          to="/"
        >
          Voltar para a loja
        </Link>
      </main>
    );
  }

  return (
    <main className="section checkout">
      <div>
        <h1>
          Entrega
        </h1>

        {!orderId ? (
          <form
            onSubmit={submit}
          >
            <h3>
              Dados pessoais
            </h3>

            <input
              required
              placeholder="Nome completo"
              value={form.name}
              onChange={(e) =>
                updateField(
                  "name",
                  e.target.value
                )
              }
            />

            <input
              required
              type="email"
              placeholder="E-mail"
              value={form.email}
              onChange={(e) =>
                updateField(
                  "email",
                  e.target.value
                )
              }
            />

            <input
              required
              placeholder="Telefone / WhatsApp"
              value={form.phone}
              onChange={(e) =>
                updateField(
                  "phone",
                  e.target.value
                )
              }
            />

            <h3>
              Endereço
            </h3>

            <input
              required
              placeholder="CEP"
              value={form.cep}
              onChange={(e) =>
                updateField(
                  "cep",
                  e.target.value
                )
              }
            />

            <input
              required
              placeholder="Rua / Avenida"
              value={form.street}
              onChange={(e) =>
                updateField(
                  "street",
                  e.target.value
                )
              }
            />

            <input
              required
              placeholder="Número"
              value={form.number}
              onChange={(e) =>
                updateField(
                  "number",
                  e.target.value
                )
              }
            />

            <input
              placeholder="Complemento"
              value={
                form.complement
              }
              onChange={(e) =>
                updateField(
                  "complement",
                  e.target.value
                )
              }
            />

            <input
              required
              placeholder="Bairro"
              value={
                form.neighborhood
              }
              onChange={(e) =>
                updateField(
                  "neighborhood",
                  e.target.value
                )
              }
            />

            <input
              required
              placeholder="Cidade"
              value={form.city}
              onChange={(e) =>
                updateField(
                  "city",
                  e.target.value
                )
              }
            />

            <input
              required
              placeholder="UF"
              maxLength="2"
              value={form.state}
              onChange={(e) =>
                updateField(
                  "state",
                  e.target.value
                    .toUpperCase()
                )
              }
            />

            <input
              placeholder="Ponto de referência"
              value={
                form.reference
              }
              onChange={(e) =>
                updateField(
                  "reference",
                  e.target.value
                )
              }
            />

            <h3>
              Como deseja receber?
            </h3>

            {/* MOTOBOY HEY BEAUTY */}

            <label
              style={{
                display: "block",
                padding: "18px",
                border:
                  "1px solid #ddd",
                marginBottom:
                  "12px",
                cursor:
                  "pointer",
              }}
            >
              <input
                type="radio"
                name="delivery"
                value="hey_beauty"
                checked={
                  form.deliveryMethod ===
                  "hey_beauty"
                }
                onChange={(e) =>
                  updateField(
                    "deliveryMethod",
                    e.target.value
                  )
                }
              />

              {" "}

              <strong>
                Motoboy Hey Beauty —
                R$ 15,00
              </strong>

              <p
                style={{
                  marginBottom: 0,
                }}
              >
                Entregas de segunda
                a sábado.
                Rotas organizadas
                até às 15h.
              </p>
            </label>

            {/* MOTOBOY CLIENTE */}

            <label
              style={{
                display: "block",
                padding: "18px",
                border:
                  "1px solid #ddd",
                marginBottom:
                  "12px",
                cursor:
                  "pointer",
              }}
            >
              <input
                type="radio"
                name="delivery"
                value="customer_motoboy"
                checked={
                  form.deliveryMethod ===
                  "customer_motoboy"
                }
                onChange={(e) =>
                  updateField(
                    "deliveryMethod",
                    e.target.value
                  )
                }
              />

              {" "}

              <strong>
                Vou solicitar meu
                próprio motoboy
              </strong>

              <p
                style={{
                  marginBottom: 0,
                }}
              >
                Nenhuma taxa de
                entrega será cobrada
                pela Hey Beauty.
                Você chama e paga
                seu entregador.
              </p>
            </label>

            {/* BRASIL */}

            <label
              style={{
                display: "block",
                padding: "18px",
                border:
                  "1px solid #ddd",
                marginBottom:
                  "20px",
                cursor:
                  "pointer",
              }}
            >
              <input
                type="radio"
                name="delivery"
                value="national"
                checked={
                  form.deliveryMethod ===
                  "national"
                }
                onChange={(e) =>
                  updateField(
                    "deliveryMethod",
                    e.target.value
                  )
                }
              />

              {" "}

              <strong>
                Envio para todo o
                Brasil
              </strong>

              <p
                style={{
                  marginBottom: 0,
                }}
              >
                O frete será calculado
                de acordo com o CEP
                de destino.
              </p>
            </label>

            <button
              className="btn full"
              disabled={loading}
            >
              {loading
                ? "Criando pedido..."
                : "Continuar"}
            </button>
          </form>
        ) : (
          <div className="panel">
            <h2>
              Pedido #{orderId}
            </h2>

            {form.deliveryMethod ===
            "hey_beauty" ? (
              <>
                <p>
                  Entrega selecionada:
                </p>

                <strong>
                  Motoboy Hey Beauty —
                  R$ 15,00
                </strong>

                <p>
                  Rotas de segunda a
                  sábado, organizadas
                  até às 15h.
                </p>
              </>
            ) : form.deliveryMethod ===
              "customer_motoboy" ? (
              <>
                <p>
                  Entrega selecionada:
                </p>

                <strong>
                  Motoboy solicitado
                  pela cliente
                </strong>
              </>
            ) : (
              <>
                <p>
                  Envio nacional
                  selecionado.
                </p>

                <strong>
                  Frete pendente de
                  cálculo
                </strong>

                <p>
                  O valor será
                  calculado pelo CEP
                  antes do pagamento.
                </p>
              </>
            )}

            <p>
              O próximo passo será
              configurar o pagamento.
            </p>
          </div>
        )}

        {message && (
          <p className="notice">
            {message}
          </p>
        )}
      </div>

      <aside>
        <h3>
          Resumo do pedido
        </h3>

        {cart.map(
          (item, index) => (
            <p key={index}>
              <span>
                {item.quantity}x{" "}
                {item.name}
              </span>

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

        <p>
          <span>
            Subtotal
          </span>

          <span>
            {money(subtotal)}
          </span>
        </p>

        <p>
          <span>
            Entrega
          </span>

          <span>
            {form.deliveryMethod ===
            "hey_beauty"
              ? "R$ 15,00"
              : form.deliveryMethod ===
                "customer_motoboy"
              ? "Por conta da cliente"
              : form.deliveryMethod ===
                "national"
              ? "A calcular"
              : "Selecione"}
          </span>
        </p>

        <hr />

        {!nationalShippingPending && (
          <b>
            <span>Total</span>

            <span>
              {money(total)}
            </span>
          </b>
        )}

        {nationalShippingPending && (
          <b>
            Total após cálculo
            do frete
          </b>
        )}
      </aside>
    </main>
  );
}

/* =========================================================
   ADMIN
========================================================= */

function Admin() {
  const [
    credentials,
    setCredentials,
  ] = useState(() =>
    localStorage.getItem(
      "adminCred"
    ) || ""
  );

  const [products, setProducts] =
    useState([]);

  const [orders, setOrders] =
    useState([]);

  const [editingId, setEditingId] =
    useState(null);

  const [message, setMessage] =
    useState("");

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

  const headers = () =>
    credentials
      ? {
          Authorization:
            "Basic " +
            credentials,
        }
      : {};

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

        setProducts(
          Array.isArray(
            productsData
          )
            ? productsData
            : []
        );

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
      } catch (error) {
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

  if (!credentials) {
    return (
      <main className="section admin">
        <h1>
          Painel administrativo
        </h1>

        <form
          onSubmit={(event) => {
            event.preventDefault();

            const encoded =
              btoa(
                event.target
                  .user.value +
                  ":" +
                  event.target
                    .password
                    .value
              );

            localStorage.setItem(
              "adminCred",
              encoded
            );

            setCredentials(
              encoded
            );
          }}
        >
          <input
            name="user"
            defaultValue="admin"
            placeholder="Usuário"
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

  const resetForm = () => {
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

  const uploadImage =
    async (event) => {
      const file =
        event.target
          .files?.[0];

      if (!file) return;

      const formData =
        new FormData();

      formData.append(
        "image",
        file
      );

      try {
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
          "Foto enviada!"
        );
      } catch (error) {
        setMessage(
          error.message
        );
      }
    };

  const saveProduct =
    async (event) => {
      event.preventDefault();

      try {
        const price =
          parsePrice(
            form.price
          );

        const payload = {
          ...form,
          price,
          stock:
            Number(
              form.stock || 0
            ),
        };

        await api(
          editingId
            ? `/api/admin/products/${editingId}`
            : "/api/admin/products",
          {
            method:
              editingId
                ? "PUT"
                : "POST",

            headers: {
              ...headers(),
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                payload
              ),
          }
        );

        setMessage(
          "Produto salvo!"
        );

        resetForm();

        await loadData();
      } catch (error) {
        setMessage(
          error.message
        );
      }
    };

  const editProduct = (
    product
  ) => {
    setEditingId(
      product.id
    );

    setForm({
      ...product,

      price: (
        Number(
          product.price || 0
        ) / 100
      )
        .toFixed(2)
        .replace(".", ","),

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

  const deleteProduct =
    async (id) => {
      if (
        !window.confirm(
          "Excluir esta peça?"
        )
      ) {
        return;
      }

      try {
        await api(
          `/api/admin/products/${id}`,
          {
            method:
              "DELETE",
            headers:
              headers(),
          }
        );

        await loadData();
      } catch (error) {
        setMessage(
          error.message
        );
      }
    };

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

        <button onClick={logout}>
          Sair
        </button>
      </div>

      <form
        className="panel"
        onSubmit={saveProduct}
      >
        <h2>
          {editingId
            ? "Editar peça"
            : "Cadastrar peça"}
        </h2>

        <input
          required
          placeholder="Nome"
          value={form.name}
          onChange={(e) =>
            setForm({
              ...form,
              name:
                e.target.value,
            })
          }
        />

        <textarea
          placeholder="Descrição"
          value={
            form.description
          }
          onChange={(e) =>
            setForm({
              ...form,
              description:
                e.target.value,
            })
          }
        />

        <input
          required
          type="text"
          placeholder="Preço: 80,00"
          value={form.price}
          onChange={(e) =>
            setForm({
              ...form,
              price:
                e.target.value,
            })
          }
        />

        <input
          type="number"
          min="0"
          placeholder="Estoque"
          value={form.stock}
          onChange={(e) =>
            setForm({
              ...form,
              stock:
                e.target.value,
            })
          }
        />

        <input
          placeholder="Tamanhos: P,M,G"
          value={form.sizes}
          onChange={(e) =>
            setForm({
              ...form,
              sizes:
                e.target.value,
            })
          }
        />

        <input
          placeholder="Cores"
          value={form.colors}
          onChange={(e) =>
            setForm({
              ...form,
              colors:
                e.target.value,
            })
          }
        />

        <label>
          Foto
        </label>

        <input
          type="file"
          accept="image/*"
          onChange={
            uploadImage
          }
        />

        {form.image && (
          <img
            src={imageUrl(
              form.image
            )}
            alt="Preview"
            style={{
              width: "180px",
              height: "220px",
              objectFit:
                "cover",
              marginTop:
                "15px",
            }}
          />
        )}

        <button className="btn">
          Salvar peça
        </button>

        {editingId && (
          <button
            type="button"
            onClick={
              resetForm
            }
          >
            Cancelar
          </button>
        )}
      </form>

      {message && (
        <p className="notice">
          {message}
        </p>
      )}

      <h2>
        Peças cadastradas
      </h2>

      <div className="adminlist">
        {products.map(
          (product) => (
            <div key={product.id}>
              {product.image && (
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
                  }}
                />
              )}

              <b>
                {product.name}
              </b>

              <span>
                {money(
                  product.price
                )}
                {" · "}
                estoque{" "}
                {product.stock}
              </span>

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

      <h2>
        Pedidos
      </h2>

      <div className="adminlist">
        {orders.map(
          (order) => (
            <div key={order.id}>
              <b>
                Pedido #{order.id}
              </b>

              <span>
                {order.customer_name}
                {" · "}

                {order.total != null
                  ? money(
                      order.total
                    )
                  : "Frete pendente"}
              </span>
            </div>
          )
        )}
      </div>
    </main>
  );
}

/* =========================================================
   INICIAR
========================================================= */

createRoot(
  document.getElementById("root")
).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);