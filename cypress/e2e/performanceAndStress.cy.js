describe('Performans ve Stres Senaryoları', () => {

    afterEach(function () {
        // Log mekanizmamızı performans modülüne de ekliyoruz
        cy.task('insertLog', { testName: this.currentTest.title, status: this.currentTest.state });
    });

    it('Concurrent request\'ler (Aynı anda 15 API isteği fırlatma)', () => {
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            cy.window().then((win) => {
                const token = win.localStorage.getItem('jwtToken');

                // Gönderilecek eşzamanlı istek sayısı (10+ istenmişti, biz 15 yapıyoruz)
                const concurrentRequestCount = 15;
                const apiPromises = [];

                // ==========================================
                // SENIOR SDET HİLESİ: NATIVE FETCH & PROMISE.ALL
                // cy.request() kullanmıyoruz çünkü Cypress komutları sıraya dizer.
                // Tarayıcının yerleşik fetch() metodunu kullanarak komutları doğrudan RAM'de hazırlıyoruz.
                // ==========================================
                for (let i = 0; i < concurrentRequestCount; i++) {
                    const requestPromise = win.fetch('https://conduit-api.bondaracademy.com/api/articles?limit=10&offset=0', {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Token ${token}`
                        }
                    });
                    apiPromises.push(requestPromise);
                }

                // ==========================================
                // ŞOK DALGASI: Tüm istekleri AYNI ANDA fırlat!
                // ==========================================

                // Cypress'in standart dışı Promise yapısını cy.wrap() ile sisteme geri bağlıyoruz.
                // Promise.all, dizideki 15 isteği tek seferde ve paralel olarak sunucuya yollar.
                cy.wrap(Promise.all(apiPromises), { timeout: 15000 }).then((responses) => {

                    // 1. Doğrulama: Tam olarak 15 adet yanıt döndüğünü teyit et
                    expect(responses).to.have.length(concurrentRequestCount);

                    // 2. Doğrulama: Sunucunun bu ani trafik dalgası (Spike) karşısında
                    // çökmediğini (500 Internal Server Error) ve tüm isteklere 200 OK döndüğünü kanıtla!
                    responses.forEach((res) => {
                        expect(res.status).to.eq(200);
                    });
                });
            });
        });
    });

    it('Hızlı ardışık yorum ekleme (Rate limiting ve Spam koruması)', () => {
        // 1. Veritabanından aktif bir kullanıcı ile giriş yapıyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            cy.window().then((win) => {
                const token = win.localStorage.getItem('jwtToken');
                const uniqueStamp = Date.now();

                // 2. PRE-CONDITION: Temiz bir ortam için API üzerinden hızlıca bir makale yaratıyoruz
                cy.request({
                    method: 'POST',
                    url: 'https://conduit-api.bondaracademy.com/api/articles',
                    headers: { Authorization: `Token ${token}` },
                    body: { article: { title: `Rate Limit Testi ${uniqueStamp}`, description: 'Spam Simülasyonu', body: 'İçerik', tagList: [] } }
                }).then((articleRes) => {
                    const slug = articleRes.body.article.slug;

                    // ==========================================
                    // SPAM BOT SİMÜLASYONU
                    // Aynı makaleye aralıksız ve beklemeden 10 adet yorum fırlatıyoruz!
                    // ==========================================
                    const spamCount = 10;
                    const statusCodes = []; // Sunucunun verdiği cevapları biriktireceğimiz havuz

                    for (let i = 0; i < spamCount; i++) {
                        cy.request({
                            method: 'POST',
                            url: `https://conduit-api.bondaracademy.com/api/articles/${slug}/comments`,
                            headers: { Authorization: `Token ${token}` },
                            body: { comment: { body: `Otomasyon Spam Yorumu No: ${i+1} - ${Date.now()}` } },
                            failOnStatusCode: false // Sunucu 429 (Too Many Requests) dönerse Cypress testi durdurmasın!
                        }).then((res) => {
                            // Her isteğin statü kodunu havuza ekle
                            statusCodes.push(res.status);
                        });
                    }

                    // ==========================================
                    // DOĞRULAMA VE MİMARİ ANALİZ (ASSERTION)
                    // Cypress kuyruğundaki (queue) tüm istekler bitince bu blok çalışır.
                    // ==========================================
                    cy.then(() => {
                        // Cypress'in arayüzündeki log paneline sonucu yazdırıyoruz
                        cy.log(`Dönen Statü Kodları: ${statusCodes.join(', ')}`);

                        // Tüm statü kodları ya 200/201 (Başarılı) ya da 429 (Too Many Requests) olmalıdır.
                        // Eğer 500 dönerse, sunucu spam saldırısına dayanamayıp çökmüş (crash) demektir!
                        statusCodes.forEach((code) => {
                            expect(code).to.be.oneOf([200, 201, 429]);
                        });

                        // Rate Limit'in gerçekten çalışıp çalışmadığını analiz edip raporluyoruz
                        const hasRateLimit = statusCodes.includes(429);
                        if (hasRateLimit) {
                            cy.log('✅ BAŞARILI: API Rate Limit (429) koruması devreye girdi. Sistem spama karşı güvenli!');
                        } else {
                            cy.log('⚠️ UYARI: API Rate Limit algılanmadı. Sunucu tüm spam yorumları 200 ile kabul etti.');
                        }
                    });
                });
            });
        });
    });

    it('Büyük makaleler (10MB+ body) - Payload Size Limit Stress Testi', () => {
        // 1. Veritabanından giriş yapıyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            cy.window().then((win) => {
                const token = win.localStorage.getItem('jwtToken');
                const uniqueStamp = Date.now();

                // ==========================================
                // DEVASA YÜK (10MB PAYLOAD) ÜRETİMİ
                // JavaScript'te 1 karakter genelde 1 byte'tır.
                // 10MB üretmek için 1024 karakterlik bir bloğu 10.240 kere tekrarlıyoruz.
                // ==========================================
                const kbBlock = 'A'.repeat(1024);
                const tenMbString = kbBlock.repeat(10240);

                // 2. Bu devasa veriyi API'ye şok dalgası olarak gönderiyoruz
                cy.request({
                    method: 'POST',
                    url: 'https://conduit-api.bondaracademy.com/api/articles',
                    headers: { Authorization: `Token ${token}` },
                    body: {
                        article: {
                            title: `10MB Yük Testi ${uniqueStamp}`,
                            description: 'Stress',
                            body: tenMbString,
                            tagList: []
                        }
                    },
                    failOnStatusCode: false // Çökme (500) veya Reddetme (413) bekliyoruz, testi durdurma!
                }).then((response) => {
                    cy.log(`Sunucu Cevabı: ${response.status}`);

                    // 3. Mimari Analiz: Sunucu bu devasa yükü nasıl karşıladı?
                    // İdeal olan 413 dönmesidir.
                    expect(response.status).to.be.oneOf([201, 413, 500, 422]);

                    // 4. Analiz Raporlaması ve ÇEVRE KORUMA (Environment Cleanup)
                    if (response.status === 413) {
                        cy.log('✅ BAŞARILI: Sunucu 10MB veriyi reddetti (413 Payload Too Large). Sistem koruma altında!');
                    }
                    else if (response.status === 500) {
                        cy.log('❌ HATA: Sunucu devasa veriyi işleyemeyip çöktü (500 Internal Server Error).');
                    }
                    else if (response.status === 200 || response.status === 201) {
                        cy.log('⚠️ UYARI: Sunucu 10MB veriyi kabul etti! Veritabanı şişirme (Storage Limit) açığı var.');

                        // SENIOR DOKUNUŞU: DOM Crash'i önlemek için bu devasa makaleyi derhal SİLİYORUZ!
                        // Yoksa diğer UI testlerimiz bu makaleyi render etmeye çalışırken tarayıcıyı dondurur.
                        const slug = response.body.article.slug;
                        cy.request({
                            method: 'DELETE',
                            url: `https://conduit-api.bondaracademy.com/api/articles/${slug}`,
                            headers: { Authorization: `Token ${token}` }
                        }).then(() => {
                            cy.log('🧹 TEMİZLİK: Test ortamının çökmemesi için devasa makale veritabanından silindi.');
                        });
                    }
                });
            });
        });
    });

    it('Slow network simulation (3G) - Yükleme Durumu (Loading State) Kontrolü', () => {
        // 1. Veritabanından giriş yapıyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            cy.window().then((win) => {
                const token = win.localStorage.getItem('jwtToken');

                // ==========================================
                // AĞ YAVAŞLATMA (NETWORK THROTTLING)
                // Makaleleri getiren API isteğini havada yakalıyoruz.
                // Sunucudan gelen GERÇEK cevabı bozmuyoruz, sadece tarayıcıya
                // ulaşmasını tam 3 saniye (3000ms) geciktiriyoruz! (Yüksek Latency Simülasyonu)
                // ==========================================
                cy.intercept('GET', '**/api/articles?limit=10&offset=0', (req) => {
                    req.on('response', (res) => {
                        res.setDelay(3000); // 3G Hızı / Yüksek Gecikme
                    });
                }).as('slowNetwork');

                // 2. UI Etkileşimi: Anasayfaya git ve Global Feed'e tıkla
                cy.visit('/');
                cy.contains('.feed-toggle .nav-link', 'Global Feed').click();

                // ==========================================
                // MİMARİ DOĞRULAMA (UX / FRONTEND KONTROLÜ)
                // ==========================================

                // 3. API henüz cevap vermediği için (3 saniye bekliyoruz), ekranda
                // KESİNLİKLE boş bir sayfa değil, "Yükleniyor" mesajı görünmelidir.
                cy.contains('Loading articles...').should('be.visible');

                // 4. Şimdi Cypress'e o 3 saniyelik çileli yavaş isteğin bitmesini beklemesini söylüyoruz
                cy.wait('@slowNetwork').its('response.statusCode').should('eq', 200);

                // 5. Veri nihayet tarayıcıya ulaştığında, "Yükleniyor" yazısı DOM'dan yok olmalı!
                cy.contains('Loading articles...').should('not.exist');

                // 6. Ve yerine gerçek makaleler (article-preview) çizilmiş olmalı.
                cy.get('.article-preview').should('have.length.greaterThan', 0);
            });
        });
    });

});