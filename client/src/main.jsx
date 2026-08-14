import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useParams,
  useNavigate,
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

const PAGBANK_PUBLIC_KEY =
  import.meta.env.VITE_PAGBANK_PUBLIC_KEY || "";

// Coloque seus links reais quando quiser ativar estes botões.
const WHATSAPP_URL =
  "https://wa.me/5571987635924?text=Ol%C3%A1%20Hey%20Beauty!%20Vim%20pelo%20site%20e%20gostaria%20de%20atendimento.";

const INSTAGRAM_URL =
  "https://www.instagram.com/heybeauty2/";

/* =========================================================
   FUNÇÕES GERAIS
========================================================= */

const money = (value) =>
  (Number(value || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const onlyNumbers = (value) =>
  String(value || "").replace(/\D/g, "");

const parsePrice = (value) => {
  if (typeof value === "number") {
    return value;
  }

  let text = String(value ?? "").trim();

  if (!text) {
    return 0;
  }

  text = text.replace(/\s/g, "");

  if (text.includes(",") && text.includes(".")) {
    text = text
      .replace(/\./g, "")
      .replace(",", ".");
  } else {
    text = text.replace(",", ".");
  }

  const number = Number(text);

  return Number.isFinite(number)
    ? number
    : 0;
};

const formatCpf = (value) => {
  const numbers =
    onlyNumbers(value).slice(0, 11);

  return numbers
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

const formatCep = (value) => {
  const numbers =
    onlyNumbers(value).slice(0, 8);

  return numbers.replace(
    /(\d{5})(\d)/,
    "$1-$2"
  );
};

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

  return API_URL + image;
};

const api = async (
  url,
  options = {}
) => {
  const finalUrl =
    url.startsWith("http")
      ? url
      : API_URL + url;

  const response =
    await fetch(
      finalUrl,
      options
    );

  const data =
    await response
      .json()
      .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error ||
        data.message ||
        "Ocorreu um erro."
    );
  }

  return data;
};

/* =========================================================
   SDK PAGBANK
========================================================= */

const loadPagBankSdk = () =>
  new Promise(
    (resolve, reject) => {
      if (window.PagSeguro) {
        resolve(
          window.PagSeguro
        );

        return;
      }

      const existing =
        document.querySelector(
          'script[data-pagbank-sdk="true"]'
        );

      if (existing) {
        existing.addEventListener(
          "load",
          () =>
            resolve(
              window.PagSeguro
            )
        );

        existing.addEventListener(
          "error",
          reject
        );

        return;
      }

      const script =
        document.createElement(
          "script"
        );

      script.src =
        "https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js";

      script.async = true;

      script.dataset.pagbankSdk =
        "true";

      script.onload = () =>
        resolve(
          window.PagSeguro
        );

      script.onerror = () =>
        reject(
          new Error(
            "Não foi possível carregar o PagBank."
          )
        );

      document.body.appendChild(
        script
      );
    }
  );

/* =========================================================
   APP
========================================================= */

function App() {
  const [cart, setCart] =
    useState(() => {
      try {
        return JSON.parse(
          localStorage.getItem(
            "cart"
          ) || "[]"
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
    setCart(
      (currentCart) => {
        const index =
          currentCart.findIndex(
            (item) =>
              item.id === product.id &&
              item.size === size &&
              item.color === color
          );

        if (index >= 0) {
          const updated = [
            ...currentCart,
          ];

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
      }
    );
  };

  const removeFromCart = (
    index
  ) => {
    setCart(
      (currentCart) =>
        currentCart.filter(
          (_, i) => i !== index
        )
    );
  };

  const cartCount =
    cart.reduce(
      (total, item) =>
        total + item.quantity,
      0
    );

  return (
    <>
      <div className="announcement-bar">
        🚚 SALVADOR R$15 • LAURO R$15 • ENVIAMOS PARA TODO O BRASIL
      </div>

      <header className="site-header">
        <div className="header-top-row">
          <span
            className="header-menu-icon"
            aria-hidden="true"
          >
            ☰
          </span>

          <Link
            className="header-page-name"
            to="/"
          >
            INÍCIO
          </Link>

          <a
            className="header-search"
            href="/#produtos"
            aria-label="Ir para produtos"
          >
            ⌕
          </a>
        </div>

        <nav className="quick-nav">
          <Link to="/">
            <span className="quick-nav-icon">⌂</span>
            <span>INÍCIO</span>
          </Link>

          <a href="/#produtos">
            <span className="quick-nav-icon">▦</span>
            <span>PRODUTOS</span>
          </a>

          <Link
            to="/carrinho"
            className="quick-cart"
          >
            <span className="quick-nav-icon">🛒</span>

            {cartCount > 0 && (
              <span className="cart-badge">
                {cartCount}
              </span>
            )}

            <span>CARRINHO</span>
          </Link>
        </nav>

        <Link
          className="header-logo"
          to="/"
          aria-label="HEY BEAUTY"
        >
          <img
            src="/logo-hey-beauty.png"
            alt="HEY BEAUTY Moda Feminina"
          />
        </Link>
      </header>

      <Routes>
        <Route
          path="/"
          element={
            <Home />
          }
        />

        <Route
          path="/produto/:id"
          element={
            <ProductPage
              addToCart={
                addToCart
              }
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
            />
          }
        />

        <Route
          path="/pagamento"
          element={
            <Payment
              cart={cart}
              setCart={
                setCart
              }
            />
          }
        />

        <Route
          path="/trocas-devolucoes"
          element={
            <PolicyPage />
          }
        />

        <Route
          path="/admin"
          element={
            <Admin />
          }
        />
      </Routes>
    </>
  );
}

/* =========================================================
   HOME
========================================================= */

function Home() {
  const [
    products,
    setProducts,
  ] = useState([]);

  const [
    error,
    setError,
  ] = useState("");

  useEffect(() => {
    api(
      "/api/products"
    )
      .then((data) => {
        setProducts(
          Array.isArray(data)
            ? data
            : []
        );
      })
      .catch((error) => {
        setError(
          error.message
        );
      });
  }, []);

  return (
    <main className="home-page">
      <section className="payment-highlight">
        <div className="payment-highlight-icon">
          ▰
        </div>

        <div>
          <strong>
            ATÉ 12X NO CARTÃO
          </strong>
          <span>
            Parcele suas compras
          </span>
        </div>

        <div
          className="highlight-dots"
          aria-hidden="true"
        >
          <i className="active" />
          <i />
        </div>
      </section>

      <section
        id="produtos"
        className="section home-products"
      >
        <div className="section-title-line">
          <span />
          <div className="section-heading-copy">
            <h2>NOVIDADES</h2>
            <p>Escolhidos para você</p>
          </div>
          <span />
        </div>

        {error && (
          <p className="notice">
            {error}
          </p>
        )}

        <div className="grid">
          {products.map(
            (product) => (
              <article
                className="card"
                key={product.id}
              >
                <Link
                  className="product-image-link"
                  to={
                    "/produto/" +
                    product.id
                  }
                >
                  <span className="product-badge">
                    NOVO
                  </span>

                  {product.image ? (
                    <img
                      src={imageUrl(
                        product.image
                      )}
                      alt={
                        product.name
                      }
                    />
                  ) : (
                    <div className="placeholder">
                      FOTO DA PEÇA
                    </div>
                  )}
                </Link>

                <div className="cardbody">
                  <h3>
                    {product.name}
                  </h3>

                  <strong>
                    {money(
                      product.price
                    )}
                  </strong>

                  {Number(
                    product.stock
                  ) <= 0 && (
                    <p className="sold-out">
                      Esgotado
                    </p>
                  )}

                  <Link
                    className="btn full"
                    to={
                      "/produto/" +
                      product.id
                    }
                  >
                    Ver produto
                  </Link>
                </div>
              </article>
            )
          )}
        </div>
      </section>

      <section className="home-links">
        <div className="home-links-inner">
          <div className="home-links-brand">
            <img
              className="home-links-logo"
              src="/logo-hey-beauty.png"
              alt="HEY BEAUTY"
            />
            <div>
              <span className="eyebrow">HEY BEAUTY</span>
              <h2>Feita para destacar você.</h2>
              <p>
                Moda feminina, atendimento próximo e uma curadoria pensada para o seu estilo.
              </p>
            </div>
          </div>

          <a
            className="link-pill"
            href="/#produtos"
          >
            <span>
              ✨ SITE OFICIAL - Compre aqui
            </span>
            <b>↗</b>
          </a>

          <a
            className="link-pill"
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
          >
            <span>
              WhatsApp - Atendimento
            </span>
            <b>↗</b>
          </a>

          <Link
            className="link-pill"
            to="/trocas-devolucoes"
          >
            <span>
              Política de Trocas e Devoluções
            </span>
            <b>↗</b>
          </Link>

          <a
            className="link-pill"
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noreferrer"
          >
            <span>
              Instagram - HEY BEAUTY
            </span>
            <b>↗</b>
          </a>

          <div
            className="policy-preview"
          >
            <strong>
              Trocas e devoluções
            </strong>
            <p>
              Troca voluntária em até 3 dias úteis, conforme as condições da loja. Compras online também possuem os direitos previstos na legislação do consumidor.
            </p>
            <Link
              className="policy-inline-link"
              to="/trocas-devolucoes"
            >
              Ver política completa →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

/* =========================================================
   POLÍTICA DE TROCAS E DEVOLUÇÕES
========================================================= */

function PolicyPage() {
  return (
    <main className="policy-page">
      <section className="policy-hero">
        <span>HEY BEAUTY</span>
        <h1>Política de Trocas e Devoluções</h1>
        <p>
          Queremos que sua experiência com a HEY BEAUTY seja segura e transparente. Leia as condições abaixo antes de solicitar uma troca ou devolução.
        </p>
      </section>

      <section className="policy-content">
        <article className="policy-card">
          <h2>Troca por tamanho, modelo ou preferência</h2>
          <p>
            A HEY BEAUTY oferece, por liberalidade, prazo de <strong>3 dias úteis após o recebimento</strong> para solicitar troca por tamanho, modelo ou preferência, desde que a peça esteja dentro das condições desta política e haja disponibilidade de estoque.
          </p>
        </article>

        <article className="policy-card">
          <h2>Condições da peça</h2>
          <p>A peça deverá ser devolvida sem sinais de uso e nas mesmas condições em que foi entregue. Não serão aceitas, na troca voluntária, peças com:</p>
          <ul>
            <li>etiqueta removida, cortada, violada ou sem a etiqueta original;</li>
            <li>odor de perfume, suor, cigarro, produtos cosméticos ou qualquer outro odor;</li>
            <li>manchas, maquiagem, desodorante, sujeira ou sinais de lavagem;</li>
            <li>rasgos, fios puxados, furos, avarias, ajustes ou alterações feitas pela cliente;</li>
            <li>sinais de uso, desgaste ou qualquer condição diferente da entrega original.</li>
          </ul>
        </article>

        <article className="policy-card policy-card-highlight">
          <h2>Itens fora da troca voluntária da loja</h2>
          <p>
            Não participam da política comercial de troca por tamanho, modelo ou preferência: <strong>peças em promoção</strong>, peças de <strong>tule, renda e tricô</strong>, produtos com <strong>desconto de 20%, 30%, 40%, 50% ou superior</strong>, além de itens identificados como <strong>liquidação, bazar ou queima de estoque</strong>.
          </p>
          <p>
            <strong>Importante:</strong> essas restrições não afastam direitos obrigatórios previstos no Código de Defesa do Consumidor, inclusive em caso de defeito ou no exercício válido do direito de arrependimento em compras realizadas pela internet.
          </p>
        </article>

        <article className="policy-card">
          <h2>Compras realizadas pelo site</h2>
          <p>
            Nas compras feitas pela internet, a cliente pode exercer o <strong>direito de arrependimento no prazo legal de 7 dias corridos</strong>, contado na forma prevista pela legislação aplicável. Nesse caso, a solicitação não fica limitada ao prazo comercial de 3 dias úteis nem às exclusões de troca voluntária acima.
          </p>
        </article>

        <article className="policy-card">
          <h2>Produto com defeito</h2>
          <p>
            Se a peça apresentar defeito ou vício, entre em contato com a HEY BEAUTY assim que identificar o problema. As situações de defeito serão tratadas de acordo com os direitos e prazos previstos na legislação do consumidor, independentemente de a peça ter sido comprada em promoção.
          </p>
        </article>

        <article className="policy-card">
          <h2>Como solicitar</h2>
          <p>
            Entre em contato pelo WhatsApp informando seu nome, número do pedido, peça adquirida e motivo da solicitação. Quando necessário, poderemos pedir fotos da peça e da etiqueta para agilizar a análise.
          </p>
          <a
            className="btn policy-whatsapp"
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
          >
            Solicitar pelo WhatsApp
          </a>
        </article>

        <p className="policy-legal-note">
          Esta política comercial complementa, mas não substitui, os direitos garantidos pela legislação brasileira de proteção ao consumidor.
        </p>

        <Link className="policy-back" to="/">
          ← Voltar para a loja
        </Link>
      </section>
    </main>
  );
}

/* =========================================================
   PRODUTO
========================================================= */

function ProductPage({
  addToCart,
}) {
  const { id } =
    useParams();

  return (
    <Product
      id={id}
      addToCart={
        addToCart
      }
    />
  );
}

function Product({
  id,
  addToCart,
}) {
  const [
    product,
    setProduct,
  ] = useState(null);

  const [
    size,
    setSize,
  ] = useState("");

  const [
    color,
    setColor,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  useEffect(() => {
    api(
      "/api/products"
    )
      .then((data) => {
        const found =
          Array.isArray(data)
            ? data.find(
                (item) =>
                  item.id ==
                  id
              )
            : null;

        setProduct(
          found || null
        );
      })
      .catch((error) => {
        setMessage(
          error.message
        );
      });
  }, [id]);

  if (!product) {
    return (
      <main className="section">
        Carregando produto...
      </main>
    );
  }

  const add = () => {
    if (
      Number(
        product.stock
      ) <= 0
    ) {
      setMessage(
        "Esta peça está esgotada."
      );

      return;
    }

    if (
      product.sizes &&
      !size
    ) {
      setMessage(
        "Selecione o tamanho."
      );

      return;
    }

    if (
      product.colors &&
      !color
    ) {
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
            src={imageUrl(
              product.image
            )}
            alt={
              product.name
            }
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
          {money(
            product.price
          )}
        </h2>

        <p>
          {
            product.description
          }
        </p>

        {product.sizes && (
          <>
            <label>
              Tamanho
            </label>

            <select
              value={size}
              onChange={(e) =>
                setSize(
                  e.target.value
                )
              }
            >
              <option value="">
                Selecione
              </option>

              {product.sizes
                .split(",")
                .map(
                  (item) => (
                    <option
                      key={
                        item
                      }
                      value={
                        item
                      }
                    >
                      {
                        item
                      }
                    </option>
                  )
                )}
            </select>
          </>
        )}

        {product.colors && (
          <>
            <label>
              Cor
            </label>

            <select
              value={
                color
              }
              onChange={(e) =>
                setColor(
                  e.target.value
                )
              }
            >
              <option value="">
                Selecione
              </option>

              {product.colors
                .split(",")
                .map(
                  (item) => (
                    <option
                      key={
                        item
                      }
                      value={
                        item
                      }
                    >
                      {
                        item
                      }
                    </option>
                  )
                )}
            </select>
          </>
        )}

        <button
          className="btn full"
          onClick={add}
          disabled={
            Number(
              product.stock
            ) <= 0
          }
        >
          {Number(
            product.stock
          ) <= 0
            ? "Produto esgotado"
            : "Adicionar ao carrinho"}
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
  const total =
    cart.reduce(
      (
        sum,
        item
      ) =>
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
        <>
          <p>
            Seu carrinho está
            vazio.
          </p>

          <Link
            className="btn"
            to="/"
          >
            Ver produtos
          </Link>
        </>
      ) : (
        <>
          <div className="cart">
            {cart.map(
              (
                item,
                index
              ) => (
                <div
                  className="cartrow"
                  key={
                    index
                  }
                >
                  <div>
                    <b>
                      {
                        item.name
                      }
                    </b>

                    <small>
                      {item.size &&
                        `Tamanho: ${item.size} `}

                      {item.color &&
                        `Cor: ${item.color}`}

                      {" · "}

                      {
                        item.quantity
                      }
                      x
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
            Continuar para
            entrega
          </Link>
        </>
      )}
    </main>
  );
}

/* =========================================================
   CHECKOUT
========================================================= */

function Checkout({
  cart,
}) {
  const navigate =
    useNavigate();

  const [
    form,
    setForm,
  ] = useState({
    name: "",
    cpf: "",
    email: "",
    phone: "",

    cep: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",

    deliveryMethod: "",
  });

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    order,
    setOrder,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    loadingCep,
    setLoadingCep,
  ] = useState(false);

  const [
    shippingOptions,
    setShippingOptions,
  ] = useState([]);

  const [
    selectedShipping,
    setSelectedShipping,
  ] = useState(null);

  const [
    loadingSedex,
    setLoadingSedex,
  ] = useState(false);

  const subtotal =
    cart.reduce(
      (
        sum,
        item
      ) =>
        sum +
        item.price *
          item.quantity,
      0
    );

  const fixedDelivery =
    form.deliveryMethod ===
      "salvador" ||
    form.deliveryMethod ===
      "lauro";

  const correiosDelivery =
    form.deliveryMethod ===
    "nuvem_envio";

  const shipping =
    fixedDelivery
      ? LOCAL_SHIPPING
      : correiosDelivery &&
        selectedShipping
      ? selectedShipping.price
      : null;

  const total =
    shipping === null
      ? subtotal
      : subtotal +
        shipping;

  const updateField = (
    field,
    value
  ) => {
    setForm(
      (current) => ({
        ...current,

        [field]:
          value,
      })
    );
  };

  /* =======================================================
     BUSCAR CEP
  ======================================================= */

  const buscarCep =
    async (
      cepDigitado
    ) => {
      const cep =
        onlyNumbers(
          cepDigitado
        );

      if (
        cep.length !== 8
      ) {
        return;
      }

      try {
        setLoadingCep(
          true
        );

        const response =
          await fetch(
            `https://viacep.com.br/ws/${cep}/json/`
          );

        const data =
          await response.json();

        if (
          data.erro
        ) {
          setMessage(
            "CEP não encontrado."
          );

          return;
        }

        setForm(
          (current) => ({
            ...current,

            cep:
              data.cep ||
              formatCep(
                cep
              ),

            street:
              data.logradouro ||
              "",

            neighborhood:
              data.bairro ||
              "",

            city:
              data.localidade ||
              "",

            state:
              data.uf ||
              "",
          })
        );

        setShippingOptions(
          []
        );

        setSelectedShipping(
          null
        );

        setMessage(
          "Endereço preenchido automaticamente."
        );
      } catch {
        setMessage(
          "Não foi possível consultar o CEP."
        );
      } finally {
        setLoadingCep(
          false
        );
      }
    };

  /* =======================================================
     CALCULAR FRETE CORREIOS
  ======================================================= */

  const calcularSedex =
    async () => {
      const cep =
        onlyNumbers(
          form.cep
        );

      if (
        cep.length !== 8
      ) {
        setMessage(
          "Informe um CEP válido."
        );

        return;
      }

      try {
        setLoadingSedex(
          true
        );

        setShippingOptions(
          []
        );

        setSelectedShipping(
          null
        );

        setMessage(
          "Calculando opções de frete..."
        );

        const result =
          await api(
            "/api/frete/sedex",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  cep,
                }),
            }
          );

        const options =
          Array.isArray(
            result.options
          )
            ? result.options
            : [];

        setShippingOptions(
          options
        );

        if (
          options.length
        ) {
          setSelectedShipping(
            options[0]
          );

          setMessage(
            "Escolha a opção de frete desejada."
          );
        } else {
          setMessage(
            "Nenhuma opção dos Correios disponível para esse CEP."
          );
        }
      } catch (error) {
        setShippingOptions(
          []
        );

        setSelectedShipping(
          null
        );

        setMessage(
          error.message
        );
      } finally {
        setLoadingSedex(
          false
        );
      }
    };

  /* =======================================================
     CRIAR PEDIDO
  ======================================================= */

  const submit =
    async (
      event
    ) => {
      event.preventDefault();

      if (
        !form.deliveryMethod
      ) {
        setMessage(
          "Escolha a forma de entrega."
        );

        return;
      }

      if (
        form.deliveryMethod ===
          "nuvem_envio" &&
        !selectedShipping
      ) {
        setMessage(
          "Calcule e escolha uma opção de frete antes de continuar."
        );

        return;
      }

      if (
        onlyNumbers(
          form.cpf
        ).length !== 11
      ) {
        setMessage(
          "Informe um CPF válido."
        );

        return;
      }

      if (
        onlyNumbers(
          form.cep
        ).length !== 8
      ) {
        setMessage(
          "Informe um CEP válido."
        );

        return;
      }

      setLoading(
        true
      );

      setMessage(
        "Criando pedido..."
      );

      const completeAddress =
        [
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
          .filter(
            Boolean
          )
          .join(
            ", "
          );

      try {
        const data =
          await api(
            "/api/checkout",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  customer: {
                    name:
                      form.name,

                    cpf:
                      onlyNumbers(
                        form.cpf
                      ),

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
                  },

                  delivery: {
                    method:
                      form.deliveryMethod,

                    shipping,

                    serviceId:
                      selectedShipping
                        ?.serviceId ||
                      null,

                    service:
                      selectedShipping
                        ?.service ||
                      null,

                    deliveryTime:
                      selectedShipping
                        ?.deliveryTime ||
                      null,
                  },

                  items:
                    cart,
                }),
            }
          );

        const paymentOrder = {
          orderId:
            data.orderId,

          subtotal,

          shipping:
            data.shippingFee,

          total:
            data.total,

          deliveryMethod:
            form.deliveryMethod,

          shippingService:
            selectedShipping,

          customer: {
            ...form,

            cpf:
              onlyNumbers(
                form.cpf
              ),
          },
        };

        localStorage.setItem(
          "paymentOrder",
          JSON.stringify(
            paymentOrder
          )
        );

        setOrder(
          paymentOrder
        );

        setMessage(
          `Pedido #${data.orderId} criado com sucesso.`
        );
      } catch (
        error
      ) {
        setMessage(
          error.message
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  if (
    !cart.length
  ) {
    return (
      <main className="section">
        <h1>
          Carrinho vazio
        </h1>

        <Link
          className="btn"
          to="/"
        >
          Voltar
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

        {!order ? (
          <form
            onSubmit={
              submit
            }
          >
            <h3>
              Seus dados
            </h3>

            <input
              required
              placeholder="Nome completo"
              value={
                form.name
              }
              onChange={(e) =>
                updateField(
                  "name",
                  e.target.value
                )
              }
            />

            <input
              required
              placeholder="CPF"
              inputMode="numeric"
              maxLength="14"
              value={
                form.cpf
              }
              onChange={(e) =>
                updateField(
                  "cpf",
                  formatCpf(
                    e.target.value
                  )
                )
              }
            />

            <input
              required
              type="email"
              placeholder="E-mail"
              value={
                form.email
              }
              onChange={(e) =>
                updateField(
                  "email",
                  e.target.value
                )
              }
            />

            <input
              required
              placeholder="WhatsApp"
              value={
                form.phone
              }
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
              inputMode="numeric"
              maxLength="9"
              value={
                form.cep
              }
              onChange={(e) => {
                const formatted =
                  formatCep(
                    e.target.value
                  );

                updateField(
                  "cep",
                  formatted
                );

                setShippingOptions(
                  []
                );

                setSelectedShipping(
                  null
                );

                if (
                  onlyNumbers(
                    formatted
                  ).length ===
                  8
                ) {
                  buscarCep(
                    formatted
                  );
                }
              }}
            />

            {loadingCep && (
              <p>
                Buscando endereço...
              </p>
            )}

            <input
              required
              placeholder="Rua / Avenida"
              value={
                form.street
              }
              readOnly
            />

            <input
              required
              placeholder="Bairro"
              value={
                form.neighborhood
              }
              readOnly
            />

            <input
              required
              placeholder="Cidade"
              value={
                form.city
              }
              readOnly
            />

            <input
              required
              placeholder="UF"
              value={
                form.state
              }
              readOnly
            />

            <input
              required
              placeholder="Número"
              value={
                form.number
              }
              onChange={(e) =>
                updateField(
                  "number",
                  e.target.value
                )
              }
            />

            <input
              placeholder="Complemento (opcional)"
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

            <h3>
              Forma de entrega
            </h3>

            <label
              style={{
                display:
                  "block",

                padding:
                  "18px",

                border:
                  "1px solid #ddd",

                marginBottom:
                  "12px",
              }}
            >
              <input
                type="radio"
                name="delivery"
                value="salvador"
                checked={
                  form.deliveryMethod ===
                  "salvador"
                }
                onChange={(e) => {
                  updateField(
                    "deliveryMethod",
                    e.target.value
                  );

                  setShippingOptions(
                    []
                  );

                  setSelectedShipping(
                    null
                  );
                }}
              />

              {" "}

              <strong>
                ENTREGA FIXA -
                SALVADOR — R$
                15,00
              </strong>

              <p>
                Entregas de
                segunda a
                sábado. Rotas
                organizadas até
                às 15h.
              </p>
            </label>

            <label
              style={{
                display:
                  "block",

                padding:
                  "18px",

                border:
                  "1px solid #ddd",

                marginBottom:
                  "12px",
              }}
            >
              <input
                type="radio"
                name="delivery"
                value="lauro"
                checked={
                  form.deliveryMethod ===
                  "lauro"
                }
                onChange={(e) => {
                  updateField(
                    "deliveryMethod",
                    e.target.value
                  );

                  setShippingOptions(
                    []
                  );

                  setSelectedShipping(
                    null
                  );
                }}
              />

              {" "}

              <strong>
                ENTREGA FIXA -
                LAURO DE FREITAS
                — R$ 15,00
              </strong>

              <p>
                Entregas de
                segunda a
                sábado. Rotas
                organizadas até
                às 15h.
              </p>
            </label>

            <label
              style={{
                display:
                  "block",

                padding:
                  "18px",

                border:
                  "1px solid #ddd",

                marginBottom:
                  "12px",
              }}
            >
              <input
                type="radio"
                name="delivery"
                value="uber_99"
                checked={
                  form.deliveryMethod ===
                  "uber_99"
                }
                onChange={(e) => {
                  updateField(
                    "deliveryMethod",
                    e.target.value
                  );

                  setShippingOptions(
                    []
                  );

                  setSelectedShipping(
                    null
                  );
                }}
              />

              {" "}

              <strong>
                Uber Flash / 99
                Entrega
              </strong>

              <p>
                Valor do frete
                definido pelo
                aplicativo no
                momento da
                solicitação.
              </p>
            </label>

            <div
              style={{
                display:
                  "block",

                padding:
                  "18px",

                border:
                  "1px solid #ddd",

                marginBottom:
                  "20px",
              }}
            >
              <label>
                <input
                  type="radio"
                  name="delivery"
                  value="nuvem_envio"
                  checked={
                    form.deliveryMethod ===
                    "nuvem_envio"
                  }
                  onChange={(e) => {
                    updateField(
                      "deliveryMethod",
                      e.target.value
                    );

                    setShippingOptions(
                      []
                    );

                    setSelectedShipping(
                      null
                    );
                  }}
                />

                {" "}

                <strong>
                  Correios
                </strong>
              </label>

              <p>
                PAC, SEDEX e
                Mini Envios,
                conforme
                disponibilidade
                para o CEP.
              </p>

              {form.deliveryMethod ===
                "nuvem_envio" && (
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={
                      calcularSedex
                    }
                    disabled={
                      loadingSedex
                    }
                  >
                    {loadingSedex
                      ? "Calculando..."
                      : "Calcular frete"}
                  </button>

                  {shippingOptions.length >
                    0 && (
                    <div
                      style={{
                        marginTop:
                          "15px",
                      }}
                    >
                      <strong>
                        Escolha o
                        frete:
                      </strong>

                      {shippingOptions.map(
                        (
                          option
                        ) => (
                          <label
                            key={
                              option.serviceId
                            }
                            style={{
                              display:
                                "block",

                              padding:
                                "12px",

                              marginTop:
                                "10px",

                              border:
                                "1px solid #ddd",

                              cursor:
                                "pointer",
                            }}
                          >
                            <input
                              type="radio"
                              name="shippingOption"
                              checked={
                                selectedShipping
                                  ?.serviceId ===
                                option.serviceId
                              }
                              onChange={() =>
                                setSelectedShipping(
                                  option
                                )
                              }
                            />

                            {" "}

                            <strong>
                              {
                                option.service
                              }
                            </strong>

                            {" — "}

                            {money(
                              option.price
                            )}

                            <br />

                            <small>
                              Prazo
                              aproximado:{" "}
                              {
                                option.deliveryTime
                              }{" "}
                              dias úteis
                            </small>
                          </label>
                        )
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <button
              className="btn full"
              disabled={
                loading
              }
            >
              {loading
                ? "Criando pedido..."
                : "Continuar"}
            </button>
          </form>
        ) : (
          <div className="panel">
            <h2>
              Pedido #
              {
                order.orderId
              }
            </h2>

            {order.deliveryMethod ===
              "salvador" && (
              <p>
                ENTREGA FIXA -
                SALVADOR — R$
                15,00
              </p>
            )}

            {order.deliveryMethod ===
              "lauro" && (
              <p>
                ENTREGA FIXA -
                LAURO DE FREITAS
                — R$ 15,00
              </p>
            )}

            {order.deliveryMethod ===
              "uber_99" && (
              <p>
                Uber Flash / 99
                Entrega — valor
                definido pelo
                aplicativo.
              </p>
            )}

            {order.deliveryMethod ===
              "nuvem_envio" &&
              order.shippingService && (
                <p>
                  {
                    order.shippingService
                      .service
                  }{" "}
                  —{" "}
                  {money(
                    order.shippingService
                      .price
                  )}
                </p>
              )}

            {order.total !=
            null ? (
              <button
                className="btn full"
                onClick={() =>
                  navigate(
                    "/pagamento"
                  )
                }
              >
                Continuar para
                pagamento
              </button>
            ) : (
              <p className="notice">
                O valor da
                entrega precisa
                ser definido
                antes do
                pagamento.
              </p>
            )}
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
          Resumo
        </h3>

        {cart.map(
          (
            item,
            index
          ) => (
            <p
              key={
                index
              }
            >
              <span>
                {
                  item.quantity
                }
                x{" "}
                {
                  item.name
                }
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
            Produtos
          </span>

          <span>
            {money(
              subtotal
            )}
          </span>
        </p>

        <p>
          <span>
            Entrega
          </span>

          <span>
            {shipping !== null
              ? money(
                  shipping
                )
              : form.deliveryMethod
              ? "A definir"
              : "Selecione"}
          </span>
        </p>

        {shipping !== null && (
          <>
            <hr />

            <b>
              <span>
                Total
              </span>

              <span>
                {money(
                  total
                )}
              </span>
            </b>
          </>
        )}
      </aside>
    </main>
  );
}

/* =========================================================
   PAGAMENTO
========================================================= */

function Payment({
  cart,
  setCart,
}) {
  const [order] =
    useState(() => {
      try {
        return JSON.parse(
          localStorage.getItem(
            "paymentOrder"
          ) || "null"
        );
      } catch {
        return null;
      }
    });

  const [
    paymentMethod,
    setPaymentMethod,
  ] = useState("");

  const [
    installments,
    setInstallments,
  ] = useState(1);

  const [
    installmentPlans,
    setInstallmentPlans,
  ] = useState([]);

  const [
    loadingPlans,
    setLoadingPlans,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    pix,
    setPix,
  ] = useState(null);

  const [
    cardForm,
    setCardForm,
  ] = useState({
    holder: "",
    taxId: "",
    number: "",
    expMonth: "",
    expYear: "",
    securityCode: "",
  });

  useEffect(() => {
    loadPagBankSdk()
      .catch(
        console.error
      );
  }, []);

  if (!order) {
    return (
      <main className="section">
        <h1>
          Pedido não
          encontrado
        </h1>

        <Link
          className="btn"
          to="/"
        >
          Voltar para a
          loja
        </Link>
      </main>
    );
  }

  if (
    order.total ==
    null
  ) {
    return (
      <main className="section">
        <h1>
          Frete pendente
        </h1>

        <div className="panel">
          <p>
            O valor da entrega
            ainda precisa ser
            definido antes do
            pagamento.
          </p>
        </div>
      </main>
    );
  }

  const updateCard = (
    field,
    value
  ) => {
    setCardForm(
      (current) => ({
        ...current,

        [field]:
          value,
      })
    );
  };

  const loadInstallments =
    async (
      number
    ) => {
      const bin =
        onlyNumbers(
          number
        ).slice(0, 6);

      if (
        bin.length !== 6 ||
        !order?.orderId
      ) {
        setInstallmentPlans(
          []
        );

        return;
      }

      try {
        setLoadingPlans(
          true
        );

        const result =
          await api(
            `/api/pagbank/installments?orderId=${order.orderId}&bin=${bin}`
          );

        const plans =
          result.plans ||
          [];

        setInstallmentPlans(
          plans
        );

        if (
          plans.length
        ) {
          setInstallments(
            plans[0]
              .installments
          );
        }
      } catch (
        error
      ) {
        setMessage(
          error.message
        );
      } finally {
        setLoadingPlans(
          false
        );
      }
    };

  const payPix =
    async () => {
      try {
        setLoading(
          true
        );

        setMessage(
          "Gerando Pix..."
        );

        const result =
          await api(
            "/api/pagbank/pix",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  orderId:
                    order.orderId,
                }),
            }
          );

        setPix(
          result
        );

        setMessage(
          "Pix gerado com sucesso."
        );
      } catch (
        error
      ) {
        setMessage(
          error.message
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  const copyPix =
    async () => {
      if (
        !pix?.qrCode
      ) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          pix.qrCode
        );

        setMessage(
          "Código Pix copiado!"
        );
      } catch {
        setMessage(
          "Não foi possível copiar automaticamente."
        );
      }
    };

  const payCard =
    async () => {
      try {
        setLoading(
          true
        );

        setMessage(
          "Processando cartão..."
        );

        if (
          !PAGBANK_PUBLIC_KEY
        ) {
          throw new Error(
            "Chave pública do PagBank não configurada."
          );
        }

        if (
          !window.PagSeguro
        ) {
          await loadPagBankSdk();
        }

        const cardNumber =
          onlyNumbers(
            cardForm.number
          );

        const encrypted =
          window.PagSeguro.encryptCard(
            {
              publicKey:
                PAGBANK_PUBLIC_KEY,

              holder:
                cardForm.holder,

              number:
                cardNumber,

              expMonth:
                onlyNumbers(
                  cardForm.expMonth
                ),

              expYear:
                onlyNumbers(
                  cardForm.expYear
                ),

              securityCode:
                onlyNumbers(
                  cardForm.securityCode
                ),
            }
          );

        if (
          encrypted.hasErrors
        ) {
          throw new Error(
            encrypted.errors
              ?.map(
                (
                  error
                ) =>
                  error.message ||
                  error.code
              )
              .join(
                ", "
              ) ||
              "Dados do cartão inválidos."
          );
        }

        const result =
          await api(
            "/api/pagbank/card",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  orderId:
                    order.orderId,

                  installments,

                  bin:
                    cardNumber.slice(
                      0,
                      6
                    ),

                  encryptedCard:
                    encrypted
                      .encryptedCard,

                  holder: {
                    name:
                      cardForm.holder,

                    taxId:
                      onlyNumbers(
                        cardForm.taxId
                      ),
                  },
                }),
            }
          );

        setMessage(
          result.message ||
            "Pagamento processado."
        );

        if (
          result.status ===
          "PAID"
        ) {
          setCart([]);

          localStorage.removeItem(
            "paymentOrder"
          );

          setMessage(
            "Pagamento aprovado! Pedido confirmado."
          );
        }
      } catch (
        error
      ) {
        setMessage(
          error.message
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  return (
    <main className="section checkout">
      <div>
        <h1>
          Pagamento
        </h1>

        <div className="panel">
          <h2>
            Pedido #
            {
              order.orderId
            }
          </h2>

          <h3>
            Escolha como
            pagar
          </h3>

          <label
            style={{
              display:
                "block",

              padding:
                "18px",

              border:
                "1px solid #ddd",

              marginBottom:
                "12px",
            }}
          >
            <input
              type="radio"
              name="payment"
              value="pix"
              checked={
                paymentMethod ===
                "pix"
              }
              onChange={() => {
                setPaymentMethod(
                  "pix"
                );

                setPix(
                  null
                );
              }}
            />

            {" "}

            <strong>
              Pix
            </strong>

            <p>
              Pagamento à
              vista.
            </p>
          </label>

          <label
            style={{
              display:
                "block",

              padding:
                "18px",

              border:
                "1px solid #ddd",

              marginBottom:
                "20px",
            }}
          >
            <input
              type="radio"
              name="payment"
              value="credit"
              checked={
                paymentMethod ===
                "credit"
              }
              onChange={() => {
                setPaymentMethod(
                  "credit"
                );

                setPix(
                  null
                );
              }}
            />

            {" "}

            <strong>
              Cartão de
              crédito
            </strong>

            <p>
              Parcelamento em
              até 12x.
            </p>
          </label>

          {paymentMethod ===
            "pix" && (
            <>
              {!pix && (
                <button
                  className="btn full"
                  disabled={
                    loading
                  }
                  onClick={
                    payPix
                  }
                >
                  {loading
                    ? "Gerando Pix..."
                    : `Gerar Pix de ${money(
                        order.total
                      )}`}
                </button>
              )}

              {pix && (
                <div
                  style={{
                    textAlign:
                      "center",

                    marginTop:
                      "20px",
                  }}
                >
                  <h3>
                    Pague com
                    Pix
                  </h3>

                  <strong>
                    {money(
                      order.total
                    )}
                  </strong>

                  {pix.qrCodeImage && (
                    <div>
                      <img
                        src={
                          pix.qrCodeImage
                        }
                        alt="QR Code Pix"
                        style={{
                          width:
                            "240px",

                          maxWidth:
                            "100%",

                          margin:
                            "20px auto",
                        }}
                      />
                    </div>
                  )}

                  <p>
                    Abra o
                    aplicativo
                    do seu banco
                    e escaneie o
                    QR Code.
                  </p>

                  {pix.qrCode && (
                    <>
                      <textarea
                        readOnly
                        value={
                          pix.qrCode
                        }
                        style={{
                          width:
                            "100%",

                          minHeight:
                            "100px",
                        }}
                      />

                      <button
                        className="btn full"
                        onClick={
                          copyPix
                        }
                      >
                        Copiar
                        código Pix
                      </button>
                    </>
                  )}

                  <p>
                    Aguardando
                    pagamento...
                  </p>
                </div>
              )}
            </>
          )}

          {paymentMethod ===
            "credit" && (
            <div>
              <h3>
                Dados do cartão
              </h3>

              <input
                placeholder="Nome impresso no cartão"
                value={
                  cardForm.holder
                }
                onChange={(e) =>
                  updateCard(
                    "holder",
                    e.target.value
                  )
                }
              />

              <input
                placeholder="CPF do titular"
                inputMode="numeric"
                value={
                  cardForm.taxId
                }
                onChange={(e) =>
                  updateCard(
                    "taxId",
                    formatCpf(
                      e.target.value
                    )
                  )
                }
              />

              <input
                placeholder="Número do cartão"
                inputMode="numeric"
                autoComplete="cc-number"
                value={
                  cardForm.number
                }
                onChange={(e) => {
                  updateCard(
                    "number",
                    e.target.value
                  );

                  loadInstallments(
                    e.target.value
                  );
                }}
              />

              <div
                style={{
                  display:
                    "grid",

                  gridTemplateColumns:
                    "1fr 1fr 1fr",

                  gap:
                    "10px",
                }}
              >
                <input
                  placeholder="Mês"
                  maxLength="2"
                  inputMode="numeric"
                  value={
                    cardForm.expMonth
                  }
                  onChange={(e) =>
                    updateCard(
                      "expMonth",
                      e.target.value
                    )
                  }
                />

                <input
                  placeholder="Ano"
                  maxLength="4"
                  inputMode="numeric"
                  value={
                    cardForm.expYear
                  }
                  onChange={(e) =>
                    updateCard(
                      "expYear",
                      e.target.value
                    )
                  }
                />

                <input
                  type="password"
                  placeholder="CVV"
                  maxLength="4"
                  inputMode="numeric"
                  value={
                    cardForm.securityCode
                  }
                  onChange={(e) =>
                    updateCard(
                      "securityCode",
                      e.target.value
                    )
                  }
                />
              </div>

              <label>
                Parcelamento
              </label>

              {loadingPlans ? (
                <p>
                  Calculando
                  parcelas...
                </p>
              ) : (
                <select
                  value={
                    installments
                  }
                  onChange={(e) =>
                    setInstallments(
                      Number(
                        e.target.value
                      )
                    )
                  }
                >
                  {!installmentPlans.length && (
                    <option value="1">
                      Digite o
                      número do
                      cartão
                    </option>
                  )}

                  {installmentPlans.map(
                    (
                      plan
                    ) => (
                      <option
                        key={
                          plan.installments
                        }
                        value={
                          plan.installments
                        }
                      >
                        {
                          plan.installments
                        }
                        x de{" "}
                        {money(
                          plan.installment_value
                        )}
                        {" — "}
                        {plan.interest_free
                          ? "sem juros"
                          : `total ${money(
                              plan.amount
                                ?.value
                            )}`}
                      </option>
                    )
                  )}
                </select>
              )}

              <button
                className="btn full"
                disabled={
                  loading ||
                  !installmentPlans.length
                }
                onClick={
                  payCard
                }
              >
                {loading
                  ? "Processando..."
                  : "Finalizar pagamento"}
              </button>
            </div>
          )}
        </div>

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
          (
            item,
            index
          ) => (
            <p
              key={
                index
              }
            >
              <span>
                {
                  item.quantity
                }
                x{" "}
                {
                  item.name
                }
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
            Produtos
          </span>

          <span>
            {money(
              order.subtotal
            )}
          </span>
        </p>

        <p>
          <span>
            Entrega
          </span>

          <span>
            {order.shipping !=
            null
              ? money(
                  order.shipping
                )
              : "A definir"}
          </span>
        </p>

        <hr />

        <b>
          <span>
            Total
          </span>

          <span>
            {money(
              order.total
            )}
          </span>
        </b>
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

  const [
    products,
    setProducts,
  ] = useState([]);

  const [
    orders,
    setOrders,
  ] = useState([]);

  const [
    editingId,
    setEditingId,
  ] = useState(null);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    form,
    setForm,
  ] = useState({
    name: "",
    description: "",
    price: "",
    stock: "",
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
      } catch (
        error
      ) {
        setMessage(
          error.message
        );
      }
    };

  useEffect(() => {
    if (
      credentials
    ) {
      loadData();
    }
  }, [
    credentials,
  ]);

  if (
    !credentials
  ) {
    return (
      <main className="section admin">
        <h1>
          Painel
          administrativo
        </h1>

        <form
          onSubmit={(
            event
          ) => {
            event.preventDefault();

            const encoded =
              btoa(
                event.target
                  .user
                  .value +
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

  const resetForm =
    () => {
      setEditingId(
        null
      );

      setForm({
        name: "",
        description: "",
        price: "",
        stock: "",
        sizes:
          "P,M,G",
        colors: "",
        image: "",
        active:
          true,
      });
    };

  const uploadImage =
    async (
      event
    ) => {
      const file =
        event.target
          .files?.[0];

      if (!file) {
        return;
      }

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
              method:
                "POST",

              headers:
                headers(),

              body:
                formData,
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
      } catch (
        error
      ) {
        setMessage(
          error.message
        );
      }
    };

  const saveProduct =
    async (
      event
    ) => {
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
            Math.max(
              0,
              Number(
                form.stock ||
                  0
              )
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
      } catch (
        error
      ) {
        setMessage(
          error.message
        );
      }
    };

  const editProduct =
    (
      product
    ) => {
      setEditingId(
        product.id
      );

      setForm({
        name:
          product.name ||
          "",

        description:
          product.description ||
          "",

        price:
          (
            Number(
              product.price ||
                0
            ) / 100
          )
            .toFixed(
              2
            )
            .replace(
              ".",
              ","
            ),

        stock:
          String(
            product.stock ??
              0
          ),

        sizes:
          product.sizes ||
          "",

        colors:
          product.colors ||
          "",

        image:
          product.image ||
          "",

        active:
          Boolean(
            product.active
          ),
      });

      window.scrollTo({
        top: 0,

        behavior:
          "smooth",
      });
    };

  const deleteProduct =
    async (
      id
    ) => {
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
      } catch (
        error
      ) {
        setMessage(
          error.message
        );
      }
    };

  const logout =
    () => {
      localStorage.removeItem(
        "adminCred"
      );

      setCredentials(
        ""
      );
    };

  return (
    <main className="section admin">
      <div className="adminhead">
        <h1>
          Painel HEY
          BEAUTY
        </h1>

        <button
          onClick={
            logout
          }
        >
          Sair
        </button>
      </div>

      <form
        className="panel"
        onSubmit={
          saveProduct
        }
      >
        <h2>
          {editingId
            ? "Editar peça"
            : "Cadastrar peça"}
        </h2>

        <input
          required
          placeholder="Nome"
          value={
            form.name
          }
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
          value={
            form.price
          }
          onChange={(e) =>
            setForm({
              ...form,

              price:
                e.target.value,
            })
          }
        />

        <input
          required
          type="number"
          min="0"
          step="1"
          placeholder="Estoque"
          value={
            form.stock
          }
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
          value={
            form.sizes
          }
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
          value={
            form.colors
          }
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
              width:
                "180px",

              height:
                "220px",

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
          (
            product
          ) => (
            <div
              key={
                product.id
              }
            >
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
                {
                  product.name
                }
              </b>

              <span>
                {money(
                  product.price
                )}

                {" · "}

                estoque{" "}

                {
                  product.stock
                }
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
          (
            order
          ) => (
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

                {order.total !=
                null
                  ? money(
                      order.total
                    )
                  : "Frete pendente"}

                {" · "}

                {order.payment_status ||
                  "pending"}
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
  document.getElementById(
    "root"
  )
).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);