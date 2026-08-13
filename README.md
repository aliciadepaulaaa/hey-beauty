# Loja online — projeto inicial funcional

## O que já existe
- Loja responsiva.
- Catálogo de produtos.
- Página individual do produto.
- Carrinho.
- Checkout com dados do cliente.
- Banco SQLite.
- Painel administrativo com login.
- Cadastro/edição/exclusão de produtos.
- Upload de fotos.
- Controle de estoque.
- Registro de pedidos.
- Integração preparada para Mercado Pago.

## Como rodar
1. Instale Node.js 20+.
2. Abra esta pasta no VS Code.
3. No terminal:
   npm install
4. Copie `.env.example` para `.env`.
5. Altere ADMIN_PASSWORD.
6. Para testar sem pagamento real:
   npm run dev
   Abra http://localhost:5173

## Pagamento real
Para o checkout funcionar com pagamento real, crie uma aplicação no Mercado Pago e coloque o Access Token em:
MERCADOPAGO_ACCESS_TOKEN=...
Também troque PUBLIC_URL pelo endereço HTTPS da loja quando publicar.

Importante: o projeto não armazena dados de cartão. O cliente é levado ao checkout do provedor de pagamento.

## Publicação
Para colocar em produção, recomendo hospedar o frontend/backend em uma plataforma com Node e usar um banco PostgreSQL/Supabase. SQLite e uploads locais são adequados para desenvolvimento/testes, mas não são a melhor opção para uma loja com tráfego real.

## Próximas melhorias recomendadas
- Logo/nome/identidade visual da sua loja.
- Categorias e filtros.
- Cupom de desconto.
- Frete por CEP.
- Webhook do Mercado Pago para atualizar automaticamente o status do pedido.
- E-mail/WhatsApp de confirmação.
- Banco PostgreSQL/Supabase para produção.
- Proteção administrativa mais robusta.
- Página de política de troca, privacidade e termos.
