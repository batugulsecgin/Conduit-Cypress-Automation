describe('Authentication & Authorization Senaryoları', () => {

    // UYGULAMANIN KENDİNDEN KAYNAKLANAN JS HATALARINI GÖRMEZDEN GELME KOMUTU
    Cypress.on('uncaught:exception', (err, runnable) => {
        // false döndürmek, Cypress'in testi patlatmasını engeller
        return false;
    });

    afterEach(function () {
        // Profesyonel raporlama altyapımızı burada da koruyoruz: Sonuçlar SQLite'a!
        cy.task('insertLog', { testName: this.currentTest.title, status: this.currentTest.state });
    });

    it('Geçersiz email/password ile login denemesi (Negative Test)', () => {
        // 1. Test Verisi: Sistemde kesinlikle olmayan, uydurma bilgiler
        const invalidEmail = `wronguser_${Date.now()}@bondar.com`;
        const invalidPassword = 'WrongPassword123!';

        // 2. Araya Girme (Intercept): Login isteğinin sunucuya gidişini pusuda bekliyoruz
        cy.intercept('POST', '**/api/users/login').as('loginFailed');

        // 3. UI Etkileşimi: Login sayfasına git ve formu hatalı bilgilerle doldur
        cy.visit('/login');
        cy.get('input[placeholder="Email"]').type(invalidEmail);
        cy.get('input[placeholder="Password"]').type(invalidPassword);
        cy.get('button[type="submit"]').click();

        // 4. Backend Doğrulaması: Sunucunun isteği yetkisiz bularak reddettiğini doğrula
        // RealWorld API spesifikasyonlarında hatalı girişler genellikle 403 (Forbidden) veya 422 (Unprocessable Entity) döner
        cy.wait('@loginFailed').its('response.statusCode').should('be.oneOf', [401, 403, 422]);

        // 5. UI Doğrulaması: Kullanıcıya ekranda hata mesajı gösterildiğini teyit et
        // Önceki tecrübelerimizden ders çıkararak tam eşleşme yerine "kapsama" (include) mantığıyla arıyoruz
        cy.get('.error-messages')
            .should('be.visible')
            .and('include.text', 'invalid'); // Genellikle "email or password is invalid" yazar

        // 6. State (Durum) Doğrulaması: Sistemin bizi anasayfaya ALMADIĞINI, hala login sayfasında tuttuğunu kontrol et
        cy.url().should('include', '/login');
    });

    it('Boş form alanlarıyla login denemesi (Validation Test)', () => {
        // 1. UI Etkileşimi: Login sayfasına git
        cy.visit('/login');

        // 2. UI Doğrulaması: Hiçbir şey yazmadığımız için "Sign in" butonunun pasif (disabled) durumda olduğunu teyit et
        // Bu sayede uygulamanın Frontend korumasının çalıştığını kanıtlıyoruz.
        cy.get('button[type="submit"]').should('be.disabled');

        // (Opsiyonel Bilgi: Eğer Cypress ile bu engeli zorla aşıp butona tıklamak isteseydik
        // cy.get('button').click({ force: true }) kullanabilirdik. Ancak doğru mühendislik yaklaşımı mevcut korumayı test etmektir.)

        // 3. Güvenlik Doğrulaması: Sistemin bizi içeri almadığını, URL'in değişmediğini teyit et
        cy.url().should('include', '/login');
    });

    it('Token expires sonrası işlem denemesi (Session timeout)', () => {
        // 1. Veritabanından aktif kullanıcımızı çekip giriş yapıyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            // 2. Anasayfaya git ve giriş yaptığımızı onayla (Settings butonu görünmeli)
            cy.visit('/');
            cy.contains('.nav-link', 'Settings').should('be.visible');

            // 3. CHAOS ENGINEERING (Session Drop)
            // Token'ı bozmak veya sahte hata atmak yerine, token'ı hafızadan tamamen SİLİYORUZ.
            // Bu hamle, süresi dolmuş ve tarayıcı tarafından temizlenmiş bir oturumu kusursuz simüle eder.
            cy.clearLocalStorage();

            // 4. İşlem Denemesi: Sayfayı yenileyerek uygulamanın yetkisiz durumu fark etmesini sağla
            cy.reload();

            // 5. UI ve State Doğrulaması:
            // Uygulama çökmeden, bizi güvenli bir şekilde "Misafir" (Guest) moduna geçirdi mi?
            cy.contains('.nav-link', 'Sign in').should('be.visible');
            cy.contains('.nav-link', 'Sign up').should('be.visible');

            // Kullanıcıya özel olan Settings (Ayarlar) sekmesinin artık OLMADIĞINI doğrula
            cy.contains('.nav-link', 'Settings').should('not.exist');
        });
    });

    it('Başka kullanıcının makalesini silme denemesi (Unauthorized / IDOR)', () => {
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            // ==========================================
            // TEST İZOLASYONU (Samanlıkta iğne aramıyoruz!)
            // Global Feed test verilerimizle dolduğu için, doğrudan
            // başkasının (Artem Bondar) profil sayfasına gidiyoruz.
            // ==========================================
            cy.visit('/profile/Artem%20Bondar');

            // Profildeki makalelerden ilkine tıkla (Bunun Artem'e ait olduğundan artık %100 eminiz)
            cy.get('.article-preview').first().find('.preview-link').click();

            // GUARD: Makale detay sayfasının tam yüklendiğinden emin ol!
            cy.url().should('include', '/article/');

            // 3. UI (Arayüz) Doğrulaması: Başkasının makalesinde "Delete Article" butonu asla görünmemeli
            cy.contains('button', 'Delete Article').should('not.exist');

            // 4. BACKEND (API) Doğrulaması: Zorla silmeye çalışırsak sunucu reddetmeli!
            cy.url().then((url) => {
                const slug = url.split('/article/')[1];

                cy.window().then((win) => {
                    const token = win.localStorage.getItem('jwtToken');

                    cy.request({
                        method: 'DELETE',
                        url: `https://conduit-api.bondaracademy.com/api/articles/${slug}`,
                        headers: { Authorization: `Token ${token}` },
                        failOnStatusCode: false
                    }).then((response) => {
                        // 5. Güvenlik Doğrulaması: Sunucu 403 veya 401 ile silmeyi reddetmeli
                        expect(response.status).to.be.oneOf([401, 403]);
                    });
                });
            });
        });
    });

    it('Logout (Güvenli Çıkış) ve yetkisiz sayfalara geri dönüş denemesi', () => {
        // 1. Veritabanından aktif kullanıcımızı çekip hızlıca login oluyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            // 2. Anasayfaya git ve girişin başarılı olduğunu onayla
            cy.visit('/');
            cy.contains('.nav-link', 'Settings').should('be.visible');

            // 3. Ayarlar sayfasına git ve "Logout" butonuna tıkla
            cy.visit('/settings');
            cy.get('.btn-outline-danger').contains('logout').click();

            // 4. UI Doğrulaması: Sistemin bizi anasayfaya attığını ve misafir menüsünün geldiğini onayla
            cy.contains('.nav-link', 'Sign in').should('be.visible');
            cy.contains('.nav-link', 'Settings').should('not.exist');

            // 5. BACKEND / STATE Doğrulaması: Token gerçekten silindi mi?
            // Sadece arayüze güvenmiyoruz, tarayıcının hafızasını kontrol ediyoruz
            cy.window().then((win) => {
                const token = win.localStorage.getItem('jwtToken');
                expect(token).to.be.null; // Token tamamen yok edilmiş olmalı
            });

            // 6. SIZMA DENEMESİ (Back Navigation / Forced Routing)
            // Kullanıcı çıkış yaptı ama adres çubuğuna zorla yetki gerektiren bir sayfa yazarsa ne olur?
            cy.visit('/settings');

            // 7. Güvenlik Doğrulaması: Sistem bu yetkisiz girişi engellemeli!
            // Conduit uygulaması, yetkisiz girişleri anasayfaya (veya login'e) yönlendirir
            cy.url().should('not.include', '/settings');

            // Ayarlar formunun ekranda kesinlikle render edilmediğini (çizilmediğini) doğrula
            cy.get('input[placeholder="URL of profile picture"]').should('not.exist');
        });
    });

});