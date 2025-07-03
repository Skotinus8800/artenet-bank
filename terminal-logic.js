// ARTEnet NFC Терминал: логика

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
    nfc: document.querySelector('.step-nfc'),
    pin: document.querySelector('.step-pin'),
    result: document.querySelector('.step-result'),
};
const amountInput = document.getElementById('amount');
const payBtn = document.getElementById('payBtn');
const cancelNfcBtn = document.getElementById('cancelNfcBtn');
const pinInput = document.getElementById('pin');
const confirmPinBtn = document.getElementById('confirmPinBtn');
const resultMsg = document.getElementById('resultMsg');
const newPaymentBtn = document.getElementById('newPaymentBtn');
const errorMsg = document.getElementById('errorMsg');
const recipientInput = document.getElementById('recipient');
const saveRecipientBtn = document.getElementById('saveRecipientBtn');
const recipientSavedMsg = document.getElementById('recipientSavedMsg');

// --- Переменные состояния ---
let currentAmount = 0;
let currentUid = null;
let currentUser = null;
let currentRecipient = null;

// --- Работа с localStorage для получателя ---
function loadRecipient() {
    const val = localStorage.getItem('terminalRecipient');
    if (val) recipientInput.value = val;
    currentRecipient = val;
}
function saveRecipient() {
    const val = recipientInput.value.trim();
    if (val) {
        localStorage.setItem('terminalRecipient', val);
        currentRecipient = val;
        recipientSavedMsg.style.display = 'block';
        setTimeout(() => recipientSavedMsg.style.display = 'none', 1500);
    }
}
recipientInput.addEventListener('input', () => recipientSavedMsg.style.display = 'none');
saveRecipientBtn.addEventListener('click', saveRecipient);
loadRecipient();

// --- Переключение этапов ---
function showStep(name) {
    Object.values(steps).forEach(s => s.classList.remove('active'));
    steps[name].classList.add('active');
    errorMsg.textContent = '';
    if (name === 'amount') amountInput.focus();
    if (name === 'pin') pinInput.value = '';
}

// --- Этап 1: Ввод суммы ---
payBtn.addEventListener('click', () => {
    const val = parseInt(amountInput.value, 10);
    if (!val || val <= 0) {
        errorMsg.textContent = 'Введите корректную сумму!';
        return;
    }
    if (!recipientInput.value.trim()) {
        errorMsg.textContent = 'Укажите получателя в настройках!';
        return;
    }
    currentAmount = val;
    showStep('nfc');
    startNfcScan();
});

// --- Этап 2: Сканирование NFC ---
let nfcAbortController = null;
function startNfcScan() {
    if (!('NDEFReader' in window)) {
        errorMsg.textContent = 'Web NFC не поддерживается на этом устройстве!';
        showStep('amount');
        return;
    }
    nfcAbortController = new AbortController();
    const reader = new NDEFReader();
    reader.scan({ signal: nfcAbortController.signal }).then(() => {
        reader.onreading = event => {
            const uid = event.serialNumber;
            if (!uid) {
                errorMsg.textContent = 'Не удалось получить UID метки!';
                showStep('amount');
                return;
            }
            currentUid = uid;
            findUserByNfcUid(uid);
        };
        reader.onerror = err => {
            errorMsg.textContent = 'Ошибка чтения NFC: ' + err.message;
            showStep('amount');
        };
    }).catch(err => {
        errorMsg.textContent = 'Ошибка запуска NFC: ' + err.message;
        showStep('amount');
    });
}
cancelNfcBtn.addEventListener('click', () => {
    if (nfcAbortController) nfcAbortController.abort();
    showStep('amount');
});

// --- Поиск пользователя по UID NFC ---
function findUserByNfcUid(uid) {
    db.ref('users').orderByChild('nfcUid').equalTo(uid).once('value', snap => {
        if (!snap.exists()) {
            errorMsg.textContent = 'Пользователь с такой меткой не найден!';
            showStep('amount');
            return;
        }
        const users = snap.val();
        const userId = Object.keys(users)[0];
        currentUser = { ...users[userId], id: userId };
        showStep('pin');
    });
}

// --- Этап 3: Проверка PIN-кода ---
confirmPinBtn.addEventListener('click', () => {
    const pin = pinInput.value.trim();
    if (!pin) {
        errorMsg.textContent = 'Введите PIN-код!';
        return;
    }
    if (!currentUser || !currentUser.pin) {
        errorMsg.textContent = 'Ошибка пользователя или PIN!';
        showStep('amount');
        return;
    }
    if (pin !== currentUser.pin) {
        errorMsg.textContent = 'Неверный PIN-код!';
        return;
    }
    processPayment();
});

// --- Этап 4: Списание и запись платежа ---
function processPayment() {
    // Проверка баланса
    if (currentUser.balance === undefined || currentUser.balance < currentAmount) {
        resultMsg.textContent = 'Недостаточно средств!';
        showStep('result');
        return;
    }
    // Списание
    const newBalance = currentUser.balance - currentAmount;
    db.ref('users/' + currentUser.id + '/balance').set(newBalance)
        .then(() => {
            // Запись платежа
            const payment = {
                fromUid: currentUser.id,
                fromNfc: currentUid,
                to: currentRecipient,
                amount: currentAmount,
                date: new Date().toISOString(),
            };
            return db.ref('payments').push(payment);
        })
        .then(() => {
            resultMsg.textContent = 'Оплата успешно проведена!';
            showStep('result');
        })
        .catch(err => {
            resultMsg.textContent = 'Ошибка при оплате: ' + err.message;
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