// Единый скрипт конвертации валют для ARTEnet Bank
class CurrencyConverter {
    constructor() {
        this.rates = { EUR: 1.0 };
        this.lastUpdate = Date.now();
        this.updateInterval = 3600000; // 1 час
        this.conversionTax = 0.5; // Налог на конвертацию по умолчанию
        this.db = null; // Будет установлен позже
    }

    // Инициализация с базой данных
    initDatabase(db) {
        this.db = db;
    }

    // Загрузка курсов из админки (Firebase v9+)
    async loadRatesFromAdmin() {
        if (!this.db) return;
        try {
            const { ref, get, set } = await import('https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js');
            const ratesSnap = await get(ref(this.db, 'bank/currencies'));
            if (ratesSnap.exists()) {
                this.rates = ratesSnap.val();
                this.lastUpdate = Date.now();
                console.log('Курсы загружены из админки:', this.rates);
            } else {
                this.rates = { EUR: 1.0 };
                await set(ref(this.db, 'bank/currencies'), this.rates);
            }
        } catch (error) {
            console.warn('Не удалось загрузить курсы из админки:', error);
        }
    }

    // Загрузка налога на конвертацию из админки (Firebase v9+)
    async loadConversionTax() {
        if (!this.db) return;
        try {
            const { ref, get } = await import('https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js');
            const taxSnap = await get(ref(this.db, 'bank/conversionTax'));
            if (taxSnap.exists()) {
                this.conversionTax = taxSnap.val();
                console.log('Налог на конвертацию загружен:', this.conversionTax);
            }
        } catch (error) {
            console.warn('Не удалось загрузить налог на конвертацию:', error);
        }
    }

    // Получение курсов валют с API только для существующих валют (Firebase v9+)
    async fetchRates() {
        try {
            await this.loadRatesFromAdmin(); // Всегда подгружаем актуальные валюты из базы
            const response = await fetch('https://api.exchangerate-api.com/v4/latest/EUR');
            const data = await response.json();
            if (data.rates) {
                const apiRates = data.rates;
                const updatedRates = {};
                for (const [currency, val] of Object.entries(this.rates)) {
                    let oldRate = (typeof val === 'object' && val.rate !== undefined) ? val.rate : (typeof val === 'number' ? val : 1);
                    if (currency === 'EUR') {
                        updatedRates[currency] = { ...val, rate: 1, buy: 1, sell: 1, name: val.name || 'Евро' };
                    } else if (apiRates[currency]) {
                        updatedRates[currency] = { ...val, rate: apiRates[currency], buy: apiRates[currency], sell: apiRates[currency], name: val.name || currency };
                    } else {
                        updatedRates[currency] = { ...val, rate: oldRate, buy: oldRate, sell: oldRate, name: val.name || currency };
                        console.warn(`Курс для ${currency} не найден в API, используется старый курс: ${oldRate}`);
                    }
                }
                this.rates = updatedRates;
                this.lastUpdate = Date.now();
                console.log('Курсы валют обновлены:', this.rates);
                if (this.db) {
                    const { ref, set } = await import('https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js');
                    await set(ref(this.db, 'bank/currencies'), this.rates);
                }
            }
        } catch (error) {
            console.warn('Не удалось обновить курсы валют:', error);
        }
    }

    // Проверка необходимости обновления курсов
    async checkUpdate() {
        // Больше не обновляем автоматически, только ручное управление
        return;
    }

    // Получение всех доступных курсов (только rate)
    async getAllRates() {
        // Всегда загружаем актуальные курсы из админки
        await this.loadRatesFromAdmin();
        const result = {};
        for (const [code, val] of Object.entries(this.rates)) {
            if (typeof val === 'object' && val.rate) {
                result[code] = val.rate;
            } else if (typeof val === 'number') {
                result[code] = val;
            }
        }
        return result;
    }

    // Получение всех валют-объектов (для отображения buy/sell/name)
    async getAllCurrencyObjects() {
        // Всегда загружаем актуальные курсы из админки
        await this.loadRatesFromAdmin();
        return this.rates;
    }

    // Конвертация валют с учетом структуры-объекта
    async convert(amount, fromCurrency, toCurrency) {
        // Всегда загружаем актуальные курсы из админки перед конвертацией
        await this.loadRatesFromAdmin();
        
        if (fromCurrency === toCurrency) return amount;
        const from = this.rates[fromCurrency];
        const to = this.rates[toCurrency];
        if (!from || !to || typeof from !== 'object' || typeof to !== 'object') {
            throw new Error(`Валюта ${fromCurrency} или ${toCurrency} не настроена. Проверьте настройки в админке.`);
        }
        
        // Для конвертации из валюты A в валюту B используем курс продажи A
        // Это курс, по которому банк продаёт валюту B за валюту A
        const fromRate = from.sell || from.rate || 1;
        const toRate = to.sell || to.rate || 1;
        
        if (fromRate === undefined || toRate === undefined) {
            throw new Error(`Курсы для валют ${fromCurrency} или ${toCurrency} не настроены. Проверьте поля sell в админке.`);
        }
        
        const eurAmount = amount / fromRate;
        const convertedAmount = eurAmount * toRate;
        return Math.round(convertedAmount * 100) / 100;
    }

    // Получение курса валюты к EUR
    async getRate(currency) {
        // Всегда загружаем актуальные курсы из админки
        await this.loadRatesFromAdmin();
        const val = this.rates[currency];
        if (typeof val === 'object') {
            return val.sell || val.rate || 1;
        }
        if (typeof val === 'number') return val;
        return 1.0;
    }

    // Форматирование суммы с валютой
    formatAmount(amount, currency) {
        return `${amount.toFixed(2)} ${currency}`;
    }

    // Проверка валидности валюты
    isValidCurrency(currency) {
        return currency in this.rates;
    }

    // Получение списка доступных валют
    getAvailableCurrencies() {
        return Object.keys(this.rates);
    }

    // Расчет комиссии за конвертацию
    calculateConversionFee(amount) {
        return Math.round(amount * (this.conversionTax / 100) * 100) / 100;
    }

    // Полная конвертация с комиссией и переводом в резервный счет
    async convertWithFee(amount, fromCurrency, toCurrency, userId = null, transferToReserve = false) {
        if (fromCurrency === toCurrency) {
            return {
                originalAmount: amount,
                convertedAmount: amount,
                fee: 0,
                total: amount,
                rate: 1,
                reserveAmount: 0
            };
        }
        const convertedAmount = await this.convert(amount, fromCurrency, toCurrency);
        const fee = this.calculateConversionFee(convertedAmount);
        const total = convertedAmount + fee;
        
        // Получаем актуальные курсы для расчёта rate
        await this.loadRatesFromAdmin();
        const from = this.rates[fromCurrency];
        const to = this.rates[toCurrency];
        const fromRate = from && typeof from === 'object' ? (from.sell || from.rate || 1) : 1;
        const toRate = to && typeof to === 'object' ? (to.sell || to.rate || 1) : 1;
        const rate = toRate / fromRate;
        
        const reserveAmount = fee;
        
        // Переводим в резервный счёт только при реальных операциях (платежи/переводы)
        if (this.db && reserveAmount > 0 && transferToReserve && userId) {
            try {
                await this.transferToReserve(reserveAmount, toCurrency, userId);
            } catch (error) {
                console.error('Ошибка перевода в резервный счет:', error);
            }
        }
        
        return {
            originalAmount: amount,
            convertedAmount: convertedAmount,
            fee: fee,
            total: total,
            rate: rate,
            reserveAmount: reserveAmount
        };
    }

    // Перевод комиссии в резервный счет (Firebase v9+)
    async transferToReserve(amount, currency, userId) {
        if (!this.db || !userId) return; // Не создаем резервные счета при предварительных расчётах
        try {
            const { ref, get, update, push, set } = await import('https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js');
            const reserveSnap = await get(ref(this.db, 'bank/accounts/BANK_RESERVE/accounts'));
            let accounts = {};
            let reserveAccount = null;
            let reserveAccountId = null;
            
            if (reserveSnap.exists()) {
                accounts = reserveSnap.val();
                // Ищем существующий резервный счет в нужной валюте
                for (const [accId, acc] of Object.entries(accounts)) {
                    if (acc.currency === currency) {
                        reserveAccount = acc;
                        reserveAccountId = accId;
                        break;
                    }
                }
            }
            
            // Если резервный счет не найден, создаем его
            if (!reserveAccount) {
                const newAccountId = push(ref(this.db, 'bank/accounts/BANK_RESERVE/accounts')).key;
                reserveAccount = {
                    currency: currency,
                    balance: 0,
                    accountNumber: `RESERVE-${currency}`,
                    createdAt: Date.now(),
                    type: 'reserve'
                };
                reserveAccountId = newAccountId;
                accounts[newAccountId] = reserveAccount;
                
                // Сохраняем новый резервный счет
                await set(ref(this.db, 'bank/accounts/BANK_RESERVE/accounts'), accounts);
                console.log(`Создан резервный счет для валюты ${currency}`);
            }
            
            // Пополняем резервный счет
            await update(ref(this.db, `bank/accounts/BANK_RESERVE/accounts/${reserveAccountId}`), {
                balance: reserveAccount.balance + amount
            });
            
            // Записываем транзакцию
            const transactionId = push(ref(this.db, `bank/accounts/BANK_RESERVE/accounts/${reserveAccountId}/transactions`)).key;
            await set(ref(this.db, `bank/accounts/BANK_RESERVE/accounts/${reserveAccountId}/transactions/${transactionId}`), {
                type: 'conversion_fee',
                amount: amount,
                currency: currency,
                description: `Комиссия за конвертацию валют`,
                userId: userId,
                date: Date.now()
            });
            
            console.log(`Комиссия ${amount} ${currency} переведена в резервный счет`);
        } catch (error) {
            console.error('Ошибка перевода в резервный счет:', error);
            throw error;
        }
    }
}

// Глобальный экземпляр конвертера
window.currencyConverter = new CurrencyConverter();

// Инициализация при загрузке страницы
// document.addEventListener('DOMContentLoaded', () => {
//     if (window.currencyConverter) {
//         window.currencyConverter.fetchRates();
//     }
// }); 