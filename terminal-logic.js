// ARTEnet NFC Терминал: современный UX, поиск счёта по UID среди всех пользователей

// --- Настройки Firebase ---
const firebaseConfig = {
    apiKey: "AIzaSyBZkU-HmTgsFV7McrsDr-Q5WkEBxkA2SD0",
      authDomain: "artenetshop-7b884.firebaseapp.com",
      projectId: "artenetshop-7b884",
      storageBucket: "artenetshop-7b884.appspot.com",
      messagingSenderId: "542098227452",
      appId: "1:542098227452:web:ce14dfbbbd7ca0d34b5779",
      measurementId: "G-8PDLBR77YN",
      databaseURL: "https://artenetshop-7b884-default-rtdb.europe-west1.firebasedatabase.app"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- Элементы интерфейса ---
const steps = {
    amount: document.querySelector('.step-amount'),
    paycard: document.querySelector('.step-paycard'),
    nfc: document.querySelector('.step-nfc'),
    pin: document.querySelector('.step-pin'),
    result: document.querySelector('.step-result'),
};
const amountForm = document.getElementById('amountForm');
const amountInput = document.getElementById('amount');
const errorMsg = document.getElementById('errorMsg');
const paySum = document.getElementById('paySum');
const payRecipient = document.getElementById('payRecipient');
const startNfcBtn = document.getElementById('startNfcBtn');
const nfcDetails = document.getElementById('nfcDetails');
const cancelNfcBtn = document.getElementById('cancelNfcBtn');
const nfcError = document.getElementById('nfcError');
const pinForm = document.getElementById('pinForm');
const pinInput = document.getElementById('pin');
const pinError = document.getElementById('pinError');
const resultMsg = document.getElementById('resultMsg');
const resultDetails = document.getElementById('resultDetails');
const newPaymentBtn = document.getElementById('newPaymentBtn');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const recipientInput = document.getElementById('recipient');
const saveRecipientBtn = document.getElementById('saveRecipientBtn');
const recipientSavedMsg = document.getElementById('recipientSavedMsg');

// --- Состояние ---
let currentAmount = 0;
let currentRecipient = null;
let foundAccount = null; // {userId, accId, acc, user}
let nfcAbortController = null;

// --- Модалка настроек ---
function openSettings() {
    settingsModal.classList.add('active');
    recipientSavedMsg.style.display = 'none';
}
function closeSettings() {
    settingsModal.classList.remove('active');
}
function safeAddEventListener(element, event, handler) {
    if (element) {
        element.addEventListener(event, handler);
    } else {
        console.error('Element not found for event:', event);
    }
}
safeAddEventListener(openSettingsBtn, 'click', openSettings);
safeAddEventListener(closeSettingsBtn, 'click', closeSettings);
safeAddEventListener(saveRecipientBtn, 'click', () => {
    const val = recipientInput.value.trim();
    if (val) {
        localStorage.setItem('terminalRecipient', val);
        currentRecipient = val;
        recipientSavedMsg.style.display = 'block';
        setTimeout(() => recipientSavedMsg.style.display = 'none', 1500);
    }
});
safeAddEventListener(amountForm, 'submit', e => {
    e.preventDefault();
    const val = parseFloat(amountInput.value);
    if (!val || val <= 0) {
        errorMsg.textContent = 'Введите корректную сумму!';
        return;
    }
    if (!recipientInput.value.trim()) {
        errorMsg.textContent = 'Укажите получателя в настройках!';
        return;
    }
    currentAmount = val;
    paySum.textContent = val + ' ₽';
    payRecipient.textContent = 'Получатель: ' + recipientInput.value.trim();
    showStep('paycard');
});
safeAddEventListener(startNfcBtn, 'click', () => {
    showStep('nfc');
    nfcDetails.textContent = `Сумма: ${currentAmount} ₽\nПолучатель: ${recipientInput.value.trim()}`;
    startNfcScan();
});
safeAddEventListener(cancelNfcBtn, 'click', () => {
    if (nfcAbortController) nfcAbortController.abort();
    showStep('amount');
});
safeAddEventListener(pinForm, 'submit', e => {
    e.preventDefault();
    const pin = pinInput.value.trim();
    if (!pin) {
        pinError.textContent = 'Введите PIN-код!';
        return;
    }
    if (!foundAccount || !foundAccount.acc.pin) {
        pinError.textContent = 'PIN не задан для этого счёта!';
        setTimeout(() => showStep('amount'), 2000);
        return;
    }
    if (pin !== foundAccount.acc.pin) {
        pinError.textContent = 'Неверный PIN-код!';
        return;
    }
    processPayment();
});
safeAddEventListener(newPaymentBtn, 'click', () => {
    amountInput.value = '';
    showStep('amount');
});

// --- Переключение этапов ---
function showStep(name) {
    Object.values(steps).forEach(s => s.classList.remove('active'));
    steps[name].classList.add('active');
    errorMsg.textContent = '';
    nfcError.textContent = '';
    pinError.textContent = '';
    if (name === 'amount') amountInput.focus();
    if (name === 'pin') pinInput.value = '';
}

// --- Этап 1: Ввод суммы ---
amountForm.addEventListener('submit', e => {
    e.preventDefault();
    const val = parseFloat(amountInput.value);
    if (!val || val <= 0) {
        errorMsg.textContent = 'Введите корректную сумму!';
        return;
    }
    if (!recipientInput.value.trim()) {
        errorMsg.textContent = 'Укажите получателя в настройках!';
        return;
    }
    currentAmount = val;
    paySum.textContent = val + ' ₽';
    payRecipient.textContent = 'Получатель: ' + recipientInput.value.trim();
    showStep('paycard');
});

// --- Этап 2: Карточка оплаты ---
startNfcBtn.addEventListener('click', () => {
    showStep('nfc');
    nfcDetails.textContent = `Сумма: ${currentAmount} ₽\nПолучатель: ${recipientInput.value.trim()}`;
    startNfcScan();
});

// --- Этап 3: Ожидание NFC ---
function startNfcScan() {
    if (!('NDEFReader' in window)) {
        nfcError.textContent = 'Web NFC не поддерживается на этом устройстве!';
        setTimeout(() => showStep('amount'), 2000);
        return;
    }
    nfcAbortController = new AbortController();
    const reader = new NDEFReader();
    reader.scan({ signal: nfcAbortController.signal }).then(() => {
        reader.onreading = event => {
            const uid = event.serialNumber;
            if (!uid) {
                nfcError.textContent = 'Не удалось получить UID метки!';
                setTimeout(() => showStep('amount'), 2000);
                return;
            }
            findAccountByNfcUid(uid);
        };
        reader.onerror = err => {
            nfcError.textContent = 'Ошибка чтения NFC: ' + err.message;
            setTimeout(() => showStep('amount'), 2000);
        };
    }).catch(err => {
        nfcError.textContent = 'Ошибка запуска NFC: ' + err.message;
        setTimeout(() => showStep('amount'), 2000);
    });
}
cancelNfcBtn.addEventListener('click', () => {
    if (nfcAbortController) nfcAbortController.abort();
    showStep('amount');
});

// --- Поиск счёта по UID NFC среди всех пользователей ---
function findAccountByNfcUid(uid) {
    nfcError.textContent = 'Поиск счёта по метке...';
    db.ref('bank/accounts').once('value', snap => {
        const accountsRoot = snap.val() || {};
        let found = null;
        let foundUser = null;
        Object.entries(accountsRoot).forEach(([userId, userAccs]) => {
            if (userAccs.accounts) {
                Object.entries(userAccs.accounts).forEach(([accId, acc]) => {
                    if (acc.nfcUid === uid) {
                        found = { userId, accId, acc };
                        foundUser = userAccs;
                    }
                });
            }
        });
        if (!found) {
            nfcError.textContent = 'Счёт с такой меткой не найден!';
            setTimeout(() => showStep('amount'), 2000);
            return;
        }
        foundAccount = { ...found, user: foundUser };
        showPinStep();
    });
}

// --- Этап 4: Ввод PIN-кода ---
function showPinStep() {
    pinInput.value = '';
    pinError.textContent = '';
    showStep('pin');
}
pinForm.addEventListener('submit', e => {
    e.preventDefault();
    const pin = pinInput.value.trim();
    if (!pin) {
        pinError.textContent = 'Введите PIN-код!';
        return;
    }
    if (!foundAccount || !foundAccount.acc.pin) {
        pinError.textContent = 'PIN не задан для этого счёта!';
        setTimeout(() => showStep('amount'), 2000);
        return;
    }
    if (pin !== foundAccount.acc.pin) {
        pinError.textContent = 'Неверный PIN-код!';
        return;
    }
    processPayment();
});

// --- Этап 5: Списание и запись платежа ---
function processPayment() {
    const acc = foundAccount.acc;
    if (acc.balance === undefined || acc.balance < currentAmount) {
        resultMsg.textContent = 'Недостаточно средств!';
        resultDetails.textContent = `Баланс: ${acc.balance} ${acc.currency}`;
        showStep('result');
        return;
    }
    const newBalance = acc.balance - currentAmount;
    db.ref(`bank/accounts/${foundAccount.userId}/accounts/${foundAccount.accId}/balance`).set(newBalance)
        .then(() => {
            // Запись платежа
            const payment = {
                fromUserId: foundAccount.userId,
                fromAccountId: foundAccount.accId,
                fromAccountNumber: acc.accountNumber,
                fromUserEmail: foundAccount.user.email || '',
                amount: currentAmount,
                currency: acc.currency,
                to: currentRecipient,
                date: new Date().toISOString(),
            };
            return db.ref('bank/payments/history').push(payment);
        })
        .then(() => {
            resultMsg.textContent = 'Оплата успешна!';
            resultDetails.textContent = `Счёт: ${acc.accountNumber} (${acc.currency})\nСумма: ${currentAmount} ₽\nПолучатель: ${currentRecipient}`;
            showStep('result');
        })
        .catch(err => {
            resultMsg.textContent = 'Ошибка при оплате: ' + err.message;
            resultDetails.textContent = '';
            showStep('result');
        });
}

// --- Новый платёж ---
newPaymentBtn.addEventListener('click', () => {
    amountInput.value = '';
    showStep('amount');
});

// --- Инициализация ---
showStep('amount'); 