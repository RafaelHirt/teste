# Goiás · Painel de Unidades

Dashboard para acompanhar valores mensais, empenhos, **A Empenhar**, glosas e vigências, por unidade e no total, com mapa dos 246 municípios de Goiás. Frontend React e servidor em Netlify Functions; a planilha é consultada pelo servidor, sem expor credenciais no navegador.

**Integração validada com a planilha real:** aba `Planilha1`, 51 registros, 27 unidades e 17 municípios. A API local retornou HTTP 200 com dados do Google. Os valores financeiros da origem foram conferidos independentemente com a exportação; o indicador mensal usa somente as vigências do mês atual. Há unidades com datas ausentes, invertidas ou sobrepostas; o painel sinaliza essas pendências e identifica o subtotal mensal como parcial quando não é possível confirmar todas as unidades. A publicação e a execução diária no Netlify ainda precisam ser validadas no projeto conectado. A demonstração permanece identificada e só é usada mediante escolha do usuário quando a leitura real falha.

## Desenvolver

Requisitos: Node.js 24 e npm.

```sh
cd /workspace/teste
npm ci
cp .env.example .env
npm run dev
```

O comando de desenvolvimento usa o proxy HTTPS do ambiente quando presente (Node.js 24, `--use-env-proxy`), preservando TLS. O servidor atende na porta 5173 e mantém a última leitura em `.cache/` (ignorada pelo Git). A rota `/api/dashboard` executa a mesma leitura e normalização usadas no Netlify. Para explorar a interface sem acesso ao Google, use o botão **Explorar demonstração**, ou execute `npm run dev -- --demo`. O modo de demonstração não é ativado na produção.

```sh
npm test                 # regras financeiras, XLSX, autenticação e sincronização
npm run build            # frontend de produção
npm run check:functions  # empacotamento real das funções pelo bundler do Netlify
npx playwright install chromium  # primeira execução dos testes de interface
npm run test:e2e         # interface, filtros, mapa, CSV, erros e versão móvel
```

Se o ambiente limitar escrita no diretório pessoal, use `npm --cache /workspace/.cache/npm ci`. O Playwright utiliza `/usr/bin/chromium` quando disponível; em outras máquinas, utiliza o navegador instalado pelo Playwright. `CHROMIUM_PATH` permite escolher um executável existente.

## Publicar no Netlify

1. No Netlify, crie um projeto importando o repositório GitHub **RafaelHirt/teste**, branch **main**.
2. O arquivo `netlify.toml` define `npm run build`, publicação de `dist/`, funções em `netlify/functions/` e Node.js 24. Não é necessário um servidor separado.
3. Escolha a forma de acesso ao arquivo:
   - **Arquivo com leitura por link:** não requer credenciais. O servidor tenta a exportação XLSX do Google Sheets, a tabela pública renderizada (preservando as células mescladas) e o download público de um arquivo Excel do Drive. A planilha fornecida foi lida sem credenciais adicionais.
   - **Arquivo privado:** no Google Cloud, habilite **Google Drive API**, crie uma conta de serviço e compartilhe o arquivo com seu `client_email` como **Leitor**. No Netlify, adicione o JSON completo dessa conta à variável **GOOGLE_SERVICE_ACCOUNT_JSON**, com escopo **Functions**. Não adicione o JSON ao repositório, nem a variáveis `VITE_`.
4. Se necessário, configure **SHEET_TAB** e **SHEET_COLUMNS_JSON** conforme a aba e os cabeçalhos reais. As variáveis opcionais estão descritas abaixo.
5. Publique um deploy de produção. Após mudar as variáveis, publique um novo deploy para aplicá-las.
6. Confirme que `/api/dashboard` retorna HTTP 200, `source.kind` igual a `google`, unidades e `updatedAt`. A interface deve mostrar **Planilha conectada**, sem o aviso de demonstração. Confira algumas unidades e os totais com a planilha.
7. Na lista de Functions do Netlify, confirme o agendamento de **sync-daily**, execute o teste disponibilizado pelo Netlify e verifique os logs. O agendamento só roda automaticamente em deploys de produção. Netlify Blobs é usado para persistir a última leitura, sem credenciais de armazenamento adicionais na configuração padrão da plataforma.

O agendamento é `0 9 * * *` (09h UTC, **06h de Brasília**). A primeira consulta também carrega o arquivo se não houver uma leitura válida do dia. A tela consulta o servidor a cada 15 minutos e ao voltar à aba; o servidor reutiliza o cache do dia. O botão **Consultar planilha** verifica a leitura diária, sem forçar downloads repetidos do Google. Uma falha preserva a última leitura e mostra um aviso com a data real.

O front e as funções são preparados para o Netlify; a publicação do site e a execução do agendamento no serviço precisam ser validadas no projeto Netlify conectado. Esta implementação não cria automaticamente uma conta ou um site Netlify.

## Planilha e cabeçalhos

| Variável                      | Finalidade                                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHEET_ID`                    | ID do arquivo. Padrão: `1emv6gWelcVeKFFvZQlHIC5V2d2PT2p5t`.                                                                                               |
| `SHEET_TAB`                   | Nome exato da aba, `Planilha1` no arquivo fornecido. Se houver várias abas compatíveis, é obrigatório escolher uma; elas não são somadas automaticamente. |
| `SHEET_COLUMNS_JSON`          | Mapeia campos internos para os cabeçalhos exatos da planilha.                                                                                             |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Credencial de conta de serviço, apenas no servidor, para arquivos privados.                                                                               |

O leitor procura cabeçalhos nas primeiras 40 linhas e aceita estas colunas, além de variantes usuais com ou sem acentos:

| Campo interno  | Cabeçalho padrão   | Exibição                                |
| -------------- | ------------------ | --------------------------------------- |
| `unit`         | Unidade            | Nome da unidade                         |
| `municipality` | Município          | Filtro e localização aproximada no mapa |
| `monthly`      | Valor Mensal       | Valor mensal                            |
| `committed`    | Valor Empenhado    | Empenhado                               |
| `remaining`    | A Empenhar         | Saldo oficial da planilha               |
| `deduction`    | Glosa              | Glosa, mostrada separadamente           |
| `start`        | Início da Vigência | Data inicial                            |
| `end`          | Fim da Vigência    | Data final                              |

Exemplo de `SHEET_COLUMNS_JSON`:

```json
{
  "unit": "Unidade",
  "municipality": "Município",
  "monthly": "Valor Mensal",
  "committed": "Valor Empenhado",
  "remaining": "A Empenhar",
  "deduction": "Glosa",
  "start": "Início da Vigência",
  "end": "Fim da Vigência"
}
```

Unidade e pelo menos uma coluna financeira são necessárias para reconhecer uma tabela. Colunas ausentes geram observações e **Não informado**. Datas brasileiras (`dd/mm/aaaa`), datas do Excel, meses como `jul.-25`, `mai/26` e números BRL são aceitos. Vigências por mês mantêm essa precisão na tela; para filtros, início e fim cobrem o mês inteiro. Fórmulas usam os resultados já salvos no arquivo: o servidor não recalcula fórmulas do Excel. Arquivos XLSX têm limite de 20 MB.

### Regras dos indicadores

- **A Empenhar é lido diretamente.** Um hífen isolado `-` nessa coluna representa **0** e **100% empenhado**, conforme solicitado. Não há cálculo a partir de valor mensal, glosa, empenho ou duração da vigência.
- Glosa aparece separadamente, conforme a coluna da planilha.
- Valores vazios ou inválidos permanecem ausentes; não são convertidos para zero. O formato contábil `R$ -` representa zero. Totais parciais são identificados, e unidades sem valores continuam na tabela e no mapa.
- Linhas identificadas como total/subtotal são excluídas para evitar dupla contagem. Cada linha válida é um registro. Registros da mesma unidade no mesmo município são agrupados na tabela; o detalhe preserva cada vigência, parcela e processo. Células monetárias mescladas são contadas uma única vez, mesmo quando abrangem vários registros; são identificadas como compartilhadas no detalhe. A aba escolhida deve conter o período desejado, sem misturar versões históricas do mesmo contrato.
- O painel global mostra o primeiro início e o último término da seleção. “Vence em até 60 dias” compara a vigência ao dia corrente em Brasília. Não há extrapolação de valores históricos.
- **Valor mensal:** considera apenas os intervalos que abrangem ao menos um dia do mês atual em Brasília. Vigências históricas e futuras não são somadas. Cada unidade deve ter um único valor mensal independente confirmado; datas ausentes ou inválidas, sobreposições e mudanças de valor dentro do mês são sinalizadas. Quando o valor não pode ser determinado, a unidade fica fora do subtotal mensal, identificado como parcial; se nenhuma unidade tem valor confirmado, aparece **Não informado**. Uma célula mensal mesclada é contada uma única vez. Unidades com vigências completas inteiramente fora do mês mostram zero e **Sem vigência neste mês**.
- Os filtros selecionam as unidades exibidas. O mensal consulta todas as linhas da unidade na origem para preservar a vigência atual e os avisos, mesmo quando uma parcela ou vigência foi filtrada. Empenhos, A Empenhar, glosas e CSV seguem os registros selecionados. A exportação CSV preserva os valores originais por linha e não repete células financeiras mescladas. Conteúdo textual que possa virar fórmula ao abrir no Excel é escapado.

## Mapa

A malha dos **246 municípios de Goiás** está incluída no projeto, sem dependência de serviços de mapas durante a navegação. Municípios são associados por nome, sem distinção de acentos e com suporte ao sufixo `- GO` ou `/GO`. Os marcadores representam posições aproximadas do município, não endereços das unidades. Municípios não reconhecidos geram aviso e seus valores continuam nos totais.

Fonte: [IBGE via Geodata BR](https://github.com/tbrugz/geodata-br), arquivo `geojson/geojs-52-mun.json`. Licença CC0 1.0 em [docs/GEODATA-LICENSE.md](docs/GEODATA-LICENSE.md). A geometria foi simplificada para visualização. Para regenerá-la:

```sh
python3 scripts/generate-map.py /caminho/geojs-52-mun.json
```

## Estrutura

```text
src/                    Interface e mapa
shared/                 Regras e dados identificados de demonstração
server/                 Download, normalização XLSX e sincronização
netlify/functions/      API e atualização diária
tests/                  Testes automatizados
scripts/dev.mjs         Servidor local com a mesma integração
netlify.toml            Configuração de publicação
```

O snapshot é identificado por ID, aba e mapeamento de colunas. Ao alterar a origem, o cache anterior não é reutilizado. O cache persistente só é substituído após download e normalização completos. TLS permanece validado. A dependência transitiva `uuid` usa a versão corrigida 11.1.1 via `overrides`, compatível com a API `v4` utilizada pelo leitor XLSX.
