const SPREADSHEET_ID = '1fnmVXyVHYlKt7g6ybgOc-8PznUMg_PDUqtPXsYvkCN4';
const SHEETS = {
  transactions: 'Lancamentos',
  accounts: 'PlanoContas',
  summary: 'ResumoMensal',
  legacyTransactions: 'Lançamentos Diários',
  legacyAccounts: 'Plano de Contas Ref'
};
const TRANSACTION_HEADERS = [
  'ID', 'Documento', 'Tipo', 'Categoria', 'Descrição', 'Cliente/Fornecedor',
  'Data', 'Vencimento', 'Valor', 'Situação', 'Data do Pagamento',
  'Observações', 'Atualizado em'
];
const ACCOUNT_HEADERS = ['Tipo', 'Categoria', 'Ativo'];
const SUMMARY_HEADERS = [
  'Mês', 'Receitas', 'Despesas', 'Investimentos',
  'Resultado Operacional', 'Saldo do Mês'
];
const VALID_TYPES = ['Receita', 'Despesa', 'Investimento'];
const DEFAULT_ACCOUNTS = [
  ['Receita', 'Venda de Toras', true],
  ['Receita', 'Frete com Caminhão', true],
  ['Receita', 'Outras Receitas', true],
  ['Investimento', 'Compra de Florestas em Pé', true],
  ['Investimento', 'Compra de Máquinas/Equipamentos', true],
  ['Investimento', 'Compra de Caminhões/Carretas', true],
  ['Despesa', 'Custo da Madeira Cortada', true],
  ['Despesa', 'Serviço Terceirizado', true],
  ['Despesa', 'Manutenção das Máquinas', true],
  ['Despesa', 'Combustível das Máquinas', true],
  ['Despesa', 'Transporte de Máquinas (Prancha)', true],
  ['Despesa', 'Combustível Caminhões', true],
  ['Despesa', 'Manutenção e Pneus', true],
  ['Despesa', 'Salários da Logística', true],
  ['Despesa', 'Salário / Comissões', true],
  ['Despesa', 'Viagens Comerciais', true],
  ['Despesa', 'Pedágios e Documentos', true],
  ['Despesa', 'Impostos / Taxas', true],
  ['Despesa', 'Escritório, Contador e Sistemas', true],
  ['Despesa', 'Salários Adm e Pró-Labore', true],
  ['Despesa', 'Seguros Patrimoniais', true]
];

function doGet() {
  const html = HtmlService.createHtmlOutputFromFile('Index').getContent();
  let initial;
  try {
    initial = { data: getAppData() };
  } catch (error) {
    initial = { error: error && error.message ? error.message : String(error) };
  }
  // Inclui a primeira consulta na resposta, sem aguardar a ponte assíncrona do navegador.
  const json = JSON.stringify(initial).replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  // Usa um script normal antes do código da interface: comentários e blocos de
  // dados não executáveis podem desaparecer na conversão feita pelo HtmlService.
  return HtmlService.createHtmlOutput(html.replace(/<script\b/i, function (tag) {
    return '<script>window.CARAUNO_INITIAL_DATA = ' + json + ';</script>' + tag;
  }))
    .setTitle('Caraúno | Gestão Florestal')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function setupDatabase() {
  prepareDatabase_();
  return { success: true, message: 'Base pronta para uso.' };
}

function getAppData() {
  const db = openDatabase_();
  const transactions = readTransactions_(db.transactions, db.timezone);
  const accounts = readAccounts_(db.accounts);
  const now = new Date();
  const currentMonth = Utilities.formatDate(now, db.timezone, 'yyyy-MM');
  const stats = { revenue: 0, expenses: 0, investments: 0, pendingRevenue: 0, pendingOutflow: 0 };
  const monthTotals = {};
  const categoryTotals = {};

  transactions.forEach(function (item) {
    const month = item.date.slice(0, 7);
    const value = item.value;
    if (!monthTotals[month]) monthTotals[month] = { revenue: 0, expenses: 0, investments: 0 };
    if (item.type === 'Receita') {
      monthTotals[month].revenue += value;
      if (item.status !== 'Pago') stats.pendingRevenue += value;
    } else if (item.type === 'Despesa') {
      monthTotals[month].expenses += value;
      if (item.status !== 'Pago') stats.pendingOutflow += value;
    } else if (item.type === 'Investimento') {
      monthTotals[month].investments += value;
      if (item.status !== 'Pago') stats.pendingOutflow += value;
    }
    if (month === currentMonth) {
      if (item.type === 'Receita') stats.revenue += value;
      if (item.type === 'Despesa') {
        stats.expenses += value;
        categoryTotals[item.category] = (categoryTotals[item.category] || 0) + value;
      }
      if (item.type === 'Investimento') stats.investments += value;
    }
  });

  const monthKeys = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    monthKeys.push(Utilities.formatDate(date, db.timezone, 'yyyy-MM'));
  }
  return {
    stats: stats,
    result: stats.revenue - stats.expenses,
    currentMonth: currentMonth,
    monthLabel: monthLabelFull_(currentMonth),
    monthly: monthKeys.map(function (key) {
      const values = monthTotals[key] || { revenue: 0, expenses: 0, investments: 0 };
      return { key: key, label: monthLabel_(key), revenue: values.revenue, expenses: values.expenses, investments: values.investments };
    }),
    topCosts: Object.keys(categoryTotals).map(function (category) {
      return { category: category, value: categoryTotals[category] };
    }).sort(function (a, b) { return b.value - a.value; }).slice(0, 5),
    recent: transactions.slice(0, 8),
    accounts: accounts,
    count: transactions.length
  };
}

function listTransactions(filters) {
  const db = openDatabase_();
  const options = filters || {};
  const query = String(options.search || '').trim().toLocaleLowerCase('pt-BR');
  const filtered = readTransactions_(db.transactions, db.timezone).filter(function (item) {
    if (options.type && item.type !== options.type) return false;
    if (options.status && item.status !== options.status) return false;
    if (options.category && item.category !== options.category) return false;
    if (options.from && item.date < options.from) return false;
    if (options.to && item.date > options.to) return false;
    if (query) {
      const searchable = [item.document, item.description, item.counterparty, item.category].join(' ').toLocaleLowerCase('pt-BR');
      if (searchable.indexOf(query) === -1) return false;
    }
    return true;
  });
  const pageSize = Math.min(Math.max(Number(options.pageSize) || 25, 1), 100);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(Number(options.page) || 1, 1), pages);
  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length,
    page: page,
    pageSize: pageSize,
    pages: pages
  };
}

function getTransaction(id) {
  const transactionId = String(id || '').trim();
  if (!transactionId) return null;
  const db = openDatabase_();
  return readTransactions_(db.transactions, db.timezone).find(function (item) { return item.id === transactionId; }) || null;
}

function saveTransaction(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const db = prepareDatabase_();
    const input = payload || {};
    const type = String(input.type || '').trim();
    const category = String(input.category || '').trim();
    const date = parseDate_(input.date);
    const dueDate = parseDate_(input.dueDate);
    const paymentDate = input.paymentDate ? parseDate_(input.paymentDate) : '';
    const value = Number(input.value);
    const status = String(input.status || 'A pagar').trim();
    const accounts = readAccounts_(db.accounts);

    if (VALID_TYPES.indexOf(type) === -1) throw new Error('Selecione um tipo válido.');
    if (!accounts.some(function (account) { return account.type === type && account.category === category; })) {
      throw new Error('A categoria não está cadastrada para este tipo.');
    }
    if (!date || !dueDate) throw new Error('Informe a data e o vencimento.');
    if (!Number.isFinite(value) || value <= 0) throw new Error('Informe um valor maior que zero.');
    if (['Pago', 'A pagar'].indexOf(status) === -1) throw new Error('Selecione uma situação válida.');
    if (status === 'Pago' && !paymentDate) throw new Error('Informe a data do pagamento para lançamentos pagos.');

    const id = String(input.id || Utilities.getUuid());
    const updatedAt = new Date();
    const row = [
      id, String(input.document || '').trim(), type, category,
      String(input.description || '').trim(), String(input.counterparty || '').trim(),
      date, dueDate, value, status, paymentDate,
      String(input.notes || '').trim(), updatedAt
    ];
    const sheet = db.transactions;
    const lastRow = sheet.getLastRow();
    let targetRow = lastRow + 1;
    if (input.id && lastRow > 1) {
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
      const match = ids.findIndex(function (entry) { return entry[0] === id; });
      if (match === -1) throw new Error('Este lançamento não existe mais. Atualize a lista e tente novamente.');
      targetRow = match + 2;
    }
    sheet.getRange(targetRow, 1, 1, TRANSACTION_HEADERS.length).setValues([row]);
    refreshMonthlySummary_(db);
    return { success: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

function deleteTransaction(id) {
  const transactionId = String(id || '').trim();
  if (!transactionId) throw new Error('Lançamento inválido.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const db = prepareDatabase_();
    const lastRow = db.transactions.getLastRow();
    if (lastRow < 2) throw new Error('Lançamento não encontrado.');
    const ids = db.transactions.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    const match = ids.findIndex(function (entry) { return entry[0] === transactionId; });
    if (match === -1) throw new Error('Lançamento não encontrado.');
    db.transactions.deleteRow(match + 2);
    refreshMonthlySummary_(db);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function openDatabase_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const db = {
    spreadsheet: spreadsheet,
    transactions: spreadsheet.getSheetByName(SHEETS.transactions),
    accounts: spreadsheet.getSheetByName(SHEETS.accounts),
    summary: spreadsheet.getSheetByName(SHEETS.summary),
    timezone: spreadsheet.getSpreadsheetTimeZone() || Session.getScriptTimeZone()
  };
  if (!db.transactions || !db.accounts || !db.summary) {
    throw new Error('Faltam abas na planilha. Execute setupDatabase no editor do Apps Script para preparar a base.');
  }
  return db;
}

function prepareDatabase_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const db = {
    spreadsheet: spreadsheet,
    transactions: ensureSheet_(spreadsheet, SHEETS.transactions, TRANSACTION_HEADERS),
    accounts: ensureSheet_(spreadsheet, SHEETS.accounts, ACCOUNT_HEADERS),
    summary: ensureSheet_(spreadsheet, SHEETS.summary, SUMMARY_HEADERS),
    timezone: spreadsheet.getSpreadsheetTimeZone() || Session.getScriptTimeZone()
  };
  if (db.transactions.getLastRow() <= 1) migrateLegacyTransactions_(spreadsheet, db.transactions);
  if (db.accounts.getLastRow() <= 1) migrateLegacyAccounts_(spreadsheet, db.accounts);
  refreshMonthlySummary_(db);
  return db;
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function migrateLegacyTransactions_(spreadsheet, destination) {
  const source = spreadsheet.getSheetByName(SHEETS.legacyTransactions);
  if (!source || source.getLastRow() < 2) return;
  const data = source.getDataRange().getValues();
  const headerRow = findHeaderRow_(data, ['documento', 'tipo', 'categoria']);
  if (headerRow < 0) return;
  const headers = data[headerRow].map(normalizeText_);
  const column = function (name) { return headers.indexOf(normalizeText_(name)); };
  const migrated = [];
  for (let index = headerRow + 1; index < data.length; index += 1) {
    const sourceRow = data[index];
    const type = cell_(sourceRow, column('Tipo'));
    const category = cell_(sourceRow, column('Categoria'));
    if (!type && !category) continue;
    const dueDate = toDate_(cell_(sourceRow, column('Vencimento')));
    const paymentDate = toDate_(cell_(sourceRow, column('Data do Pagamento')));
    const date = paymentDate || dueDate;
    if (!date) continue;
    migrated.push([
      Utilities.getUuid(), cell_(sourceRow, column('Documento')), type, category,
      cell_(sourceRow, column('Descrição')), cell_(sourceRow, column('Fornecedor / Cliente')),
      date, dueDate || date, Number(cell_(sourceRow, column('Valor (R$)'))) || 0,
      cell_(sourceRow, column('Situação')) || 'A pagar', paymentDate, '', new Date()
    ]);
  }
  if (migrated.length) destination.getRange(2, 1, migrated.length, TRANSACTION_HEADERS.length).setValues(migrated);
}

function migrateLegacyAccounts_(spreadsheet, destination) {
  const source = spreadsheet.getSheetByName(SHEETS.legacyAccounts);
  if (!source) {
    destination.getRange(2, 1, DEFAULT_ACCOUNTS.length, ACCOUNT_HEADERS.length).setValues(DEFAULT_ACCOUNTS);
    return;
  }
  const data = source.getDataRange().getValues();
  const categoryColumn = data.length ? data[0].map(normalizeText_).indexOf(normalizeText_('Categorias Validas')) : -1;
  const migrated = [];
  for (let index = 1; index < data.length; index += 1) {
    const category = String(data[index][categoryColumn] || '').trim();
    if (!category) continue;
    const type = inferType_(category);
    migrated.push([type, category, true]);
  }
  const rows = migrated.length ? migrated : DEFAULT_ACCOUNTS;
  destination.getRange(2, 1, rows.length, ACCOUNT_HEADERS.length).setValues(rows);
}

function readTransactions_(sheet, timezone) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, TRANSACTION_HEADERS.length).getValues()
    .filter(function (row) { return row[0]; })
    .map(function (row) {
      return {
        id: String(row[0]), document: String(row[1] || ''), type: String(row[2] || ''),
        category: String(row[3] || ''), description: String(row[4] || ''),
        counterparty: String(row[5] || ''), date: formatDate_(row[6], timezone),
        dueDate: formatDate_(row[7], timezone), value: Number(row[8]) || 0,
        status: String(row[9] || 'A pagar'), paymentDate: formatDate_(row[10], timezone),
        notes: String(row[11] || '')
      };
    })
    .sort(function (a, b) { return b.date.localeCompare(a.date) || b.id.localeCompare(a.id); });
}

function readAccounts_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, ACCOUNT_HEADERS.length).getValues()
    .filter(function (row) { return row[1] && row[2] !== false; })
    .map(function (row) { return { type: String(row[0]), category: String(row[1]) }; });
}

function refreshMonthlySummary_(db) {
  const grouped = {};
  readTransactions_(db.transactions, db.timezone).forEach(function (item) {
    const month = item.date.slice(0, 7);
    if (!month) return;
    if (!grouped[month]) grouped[month] = { revenue: 0, expenses: 0, investments: 0 };
    if (item.type === 'Receita') grouped[month].revenue += item.value;
    if (item.type === 'Despesa') grouped[month].expenses += item.value;
    if (item.type === 'Investimento') grouped[month].investments += item.value;
  });
  const rows = Object.keys(grouped).sort().map(function (month) {
    const values = grouped[month];
    return [month, values.revenue, values.expenses, values.investments,
      values.revenue - values.expenses,
      values.revenue - values.expenses - values.investments];
  });
  const sheet = db.summary;
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, SUMMARY_HEADERS.length).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, SUMMARY_HEADERS.length).setValues(rows);
}

function findHeaderRow_(data, required) {
  for (let row = 0; row < Math.min(data.length, 8); row += 1) {
    const values = data[row].map(normalizeText_);
    if (required.every(function (header) { return values.indexOf(normalizeText_(header)) !== -1; })) return row;
  }
  return -1;
}

function inferType_(category) {
  if (/^(venda|frete com caminh[aã]o|outras receitas)/i.test(category)) return 'Receita';
  if (/^compra de /i.test(category)) return 'Investimento';
  return 'Despesa';
}

function cell_(row, index) {
  return index < 0 || row[index] == null ? '' : row[index];
}

function normalizeText_(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
}

function parseDate_(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? date : '';
}

function toDate_(value) {
  if (!value) return '';
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? '' : parsed;
}

function formatDate_(value, timezone) {
  if (!value) return '';
  const date = toDate_(value);
  return date ? Utilities.formatDate(date, timezone, 'yyyy-MM-dd') : '';
}

function monthLabel_(key) {
  const parts = key.split('-');
  return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(parts[1]) - 1];
}

function monthLabelFull_(key) {
  const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const parts = key.split('-');
  return months[Number(parts[1]) - 1] + ' ' + parts[0];
}
