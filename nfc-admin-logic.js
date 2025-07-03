// ARTEnet Bank: Привязка NFC и PIN к счету (только для админов)

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

const userSelect = document.getElementById('userSelect');
const accountsSection = document.getElementById('accountsSection');
const accountsList = document.getElementById('accountsList');
const errorMsg = document.getElementById('errorMsg');
const successMsg = document.getElementById('successMsg');

let users = {};
let currentUserId = null;

// Проверка isAdmin (по текущему залогиненному пользователю)
function checkAdmin() {
    firebase.auth().onAuthStateChanged(user => {
        if (!user) {
            errorMsg.textContent = 'Войдите как администратор!';
            return;
        }
        db.ref('users/' + user.uid + '/isAdmin').once('value', snap => {
            if (!snap.val()) {
                errorMsg.textContent = 'Доступ только для администраторов!';
                userSelect.disabled = true;
            } else {
                loadUsers();
            }
        });
    });
}

// Загрузка пользователей
function loadUsers() {
    db.ref('users').once('value', snap => {
        users = snap.val() || {};
        userSelect.innerHTML = '<option value="">Выберите...</option>';
        Object.entries(users).forEach(([uid, u]) => {
            userSelect.innerHTML += `<option value="${uid}">${u.email || u.username || uid}</option>`;
        });
    });
}

userSelect.addEventListener('change', () => {
    currentUserId = userSelect.value;
    if (!currentUserId) {
        accountsSection.style.display = 'none';
        return;
    }
    loadAccounts(currentUserId);
});

// Загрузка счетов пользователя
function loadAccounts(uid) {
    db.ref('bank/accounts/' + uid + '/accounts').once('value', snap => {
        const accounts = snap.val() || {};
        accountsList.innerHTML = '';
        Object.entries(accounts).forEach(([accId, acc]) => {
            const nfcUid = acc.nfcUid || '';
            const pin = acc.pin || '';
            accountsList.innerHTML += `
<li>
  <div>
    <b>${acc.accountNumber}</b> (${acc.currency})<br>
    Баланс: ${acc.balance} <br>
    NFC: <span class="nfc-uid">${nfcUid ? nfcUid : 'не привязано'}</span>
    <br>PIN: <span>${pin ? '****' : 'не задан'}</span>
  </div>
  <div>
    <button onclick="scanNfc('${uid}','${accId}')">Привязать NFC</button>
    <input class="pin-input" type="password" maxlength="6" placeholder="PIN" id="pin-${accId}">
    <button onclick="setPin('${uid}','${accId}')">Сохранить PIN</button>
    ${nfcUid ? `<button class='unlink-btn' onclick="unlinkNfc('${uid}','${accId}')">Отвязать</button>` : ''}
  </div>
</li>
`;
        });
        accountsSection.style.display = 'block';
    });
}

// Привязка NFC (сканирование)
window.scanNfc = function(uid, accId) {
    errorMsg.textContent = '';
    successMsg.textContent = '';
    if (!('NDEFReader' in window)) {
        errorMsg.textContent = 'Web NFC не поддерживается!';
        return;
    }
    const reader = new NDEFReader();
    reader.scan().then(() => {
        reader.onreading = event => {
            const nfcUid = event.serialNumber;
            if (!nfcUid) {
                errorMsg.textContent = 'Не удалось получить UID метки!';
                return;
            }
            db.ref(`bank/accounts/${uid}/accounts/${accId}/nfcUid`).set(nfcUid).then(() => {
                successMsg.textContent = 'NFC-метка успешно привязана!';
                loadAccounts(uid);
            });
        };
    }).catch(err => {
        errorMsg.textContent = 'Ошибка NFC: ' + err.message;
    });
};

// Установка PIN
window.setPin = function(uid, accId) {
    errorMsg.textContent = '';
    successMsg.textContent = '';
    const pinInput = document.getElementById('pin-' + accId);
    const pin = pinInput.value.trim();
    if (!pin || pin.length < 4) {
        errorMsg.textContent = 'Введите корректный PIN (минимум 4 цифры)!';
        return;
    }
    db.ref(`bank/accounts/${uid}/accounts/${accId}/pin`).set(pin).then(() => {
        successMsg.textContent = 'PIN успешно сохранён!';
        pinInput.value = '';
        loadAccounts(uid);
    });
};

// Отвязка NFC
window.unlinkNfc = function(uid, accId) {
    db.ref(`bank/accounts/${uid}/accounts/${accId}/nfcUid`).remove().then(() => {
        successMsg.textContent = 'NFC-метка отвязана.';
        loadAccounts(uid);
    });
};

checkAdmin(); 