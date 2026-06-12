describe('Feed ve Filtreleme Senaryoları', () => {

    afterEach(function () {
        // Raporlama log mekanizmamızı yeni modülümüze de entegre ediyoruz
        cy.task('insertLog', { testName: this.currentTest.title, status: this.currentTest.state });
    });

    it('Global Feed vs Personal Feed (Logged-in kullanıcı için sekme geçişleri)', () => {
        // 1. Veritabanından giriş yapıyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            // 2. Araya Girme: Sekmelerin arka planda tetiklediği farklı API endpoint'lerini dinle
            cy.intercept('GET', '**/api/articles/feed*').as('getYourFeed');
            cy.intercept('GET', '**/api/articles?limit=10&offset=0').as('getGlobalFeed');

            // 3. UI Etkileşimi: Anasayfaya git
            cy.visit('/');

            // ==========================================
            // RACE CONDITION (YARIŞ DURUMU) ÇÖZÜMÜ
            // Cypress çok hızlı olduğu için uygulamanın otomatik geçişini beklemiyoruz.
            // İnisiyatifi ele alıp önce 'Your Feed' sekmesine kendimiz tıklıyoruz!
            // ==========================================
            cy.contains('.feed-toggle .nav-link', 'Your Feed').click();

            // ==========================================
            // 1. AŞAMA: YOUR FEED KONTROLÜ
            // ==========================================

            // Artık tıkladığımız için bu isteğin kesinlikle gideceğinden eminiz
            cy.wait('@getYourFeed').its('response.statusCode').should('eq', 200);

            // State (Durum) Doğrulaması: 'Your Feed' sekmesi aktif olmalı
            cy.get('.feed-toggle .nav-link.active').should('contain.text', 'Your Feed');

            // ==========================================
            // 2. AŞAMA: GLOBAL FEED'E GEÇİŞ (Toggle İşlemi)
            // ==========================================

            // 'Global Feed' sekmesine tıklıyoruz
            cy.contains('.feed-toggle .nav-link', 'Global Feed').click();

            // Backend Doğrulaması: Tıklama anında doğru API'ye ('/articles') gidildiğini kanıtla
            cy.wait('@getGlobalFeed').its('response.statusCode').should('eq', 200);

            // State Doğrulaması 1: 'Global Feed' sekmesi yeşil (aktif) renge dönmeli
            cy.get('.feed-toggle .nav-link.active').should('contain.text', 'Global Feed');

            // State Doğrulaması 2: 'Your Feed' sekmesi artık aktif (active) class'ını KAYBETMELİDİR!
            cy.contains('.feed-toggle .nav-link', 'Your Feed').should('not.have.class', 'active');
        });
    });

    it('"My Articles" sekmesi (Kendi makalelerimi filtreleme)', () => {
        // 1. Giriş yapıyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            const uniqueStamp = Date.now();
            const myArticleTitle = `Benim Makalem ${uniqueStamp}`;

            cy.window().then((win) => {
                const token = win.localStorage.getItem('jwtToken');

                // 2. PRE-CONDITION: Test ortamını garantilemek için API'den kendimize ait bir makale yaratıyoruz
                cy.request({
                    method: 'POST',
                    url: 'https://conduit-api.bondaracademy.com/api/articles',
                    headers: { Authorization: `Token ${token}` },
                    body: { article: { title: myArticleTitle, description: 'Yazar Filtreleme Testi', body: 'İçerik', tagList: [] } }
                }).then(() => {

                    // 3. UI Etkileşimi: Anasayfaya git ve Navbar'dan kendi profilimize (ismimize) tıkla
                    cy.visit('/');
                    cy.get('.navbar').find('a[href*="/profile"]').first().click();

                    // 4. Araya Girme: Yazar parametresiyle (?author=username) atılan API isteğini dinle
                    // Kullanıcı adımız dinamik olduğu için sonunu wildcard (*) ile bırakıyoruz
                    cy.intercept('GET', '**/api/articles?author=*').as('getMyArticles');

                    // Profil sayfası açıldığında 'My Posts' sekmesi varsayılan olarak aktiftir ve veriyi çeker
                    cy.wait('@getMyArticles').its('response.statusCode').should('eq', 200);

                    // ==========================================
                    // DURUM VE LİSTE DOĞRULAMALARI
                    // ==========================================

                    // A. State Doğrulaması: Aktif olan sekmenin adının 'My Posts' olduğunu doğrula
                    cy.get('.nav-pills .nav-link.active').should('contain.text', 'My Posts');

                    // B. Entegrasyon Doğrulaması: API'den ürettiğimiz o özel makalenin listede olduğunu kanıtla
                    cy.get('.article-preview').should('contain.text', myArticleTitle);

                    // C. Mantıksal Doğrulama: Listedeki TÜM makalelerin yazar kısmında bizim adımız yazmalı!
                    // Profil sayfasındaki yazar adını alıyoruz ve listedeki her kartı tek tek kontrol ediyoruz.
                    cy.get('.profile-page h4').then(($profileName) => {
                        const authorName = $profileName.text().trim();

                        cy.get('.article-meta .author').each(($el) => {
                            cy.wrap($el).should('contain.text', authorName);
                        });
                    });
                });
            });
        });
    });

    it('Tag-based feed filtreleme (Etikete göre makale listeleme)', () => {
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            // Her test koşumunda değişecek, benzersiz (unique) bir etiket ve başlık üretiyoruz
            const uniqueStamp = Date.now();
            const uniqueTag = `cy-tag-${uniqueStamp}`;
            const articleTitle = `Tag Filtreleme Testi ${uniqueStamp}`;

            cy.window().then((win) => {
                const token = win.localStorage.getItem('jwtToken');

                // 1. PRE-CONDITION: Sisteme gizlice eşsiz etiketli makalemizi zerk ediyoruz
                cy.request({
                    method: 'POST',
                    url: 'https://conduit-api.bondaracademy.com/api/articles',
                    headers: { Authorization: `Token ${token}` },
                    body: {
                        article: {
                            title: articleTitle,
                            description: 'Etiket Filtreleme',
                            body: 'İçerik',
                            tagList: [uniqueTag] // Sadece bize ait olan o özel etiket!
                        }
                    }
                }).then(() => {

                    // 2. Araya Girme (Network Setup)
                    // ==========================================
                    // ÇÖZÜM: RESPONSE MANIPULATION (MOCKING)
                    // Sunucu yeni etiketimizi 'Popüler' bulmayıp listeye eklemeyebilir.
                    // Biz de gelen cevabın (res) içine kendi etiketimizi zorla (unshift ile başa) ekliyoruz!
                    // ==========================================
                    cy.intercept('GET', '**/api/tags', (req) => {
                        req.continue((res) => {
                            if (res.body.tags) {
                                res.body.tags.unshift(uniqueTag); // Etiketimizi listenin en başına koy
                            }
                        });
                    }).as('getTags');

                    // Etikete tıklandığında fırlatılacak olan filtreleme isteğini dinleyeceğiz
                    cy.intercept('GET', `**/api/articles?tag=${uniqueTag}*`).as('getArticlesByTag');

                    // 3. UI Etkileşimi: Anasayfaya git
                    cy.visit('/');

                    // GUARD: Sağdaki etiket listesinin sunucudan yüklenmesini bekle!
                    cy.wait('@getTags').its('response.statusCode').should('eq', 200);

                    // 4. Aksiyon: Sağdaki panelden (sidebar) bizim ürettiğimiz o eşsiz etiketi bul ve tıkla
                    // Artık etiketimizin listede olduğundan %100 eminiz!
                    cy.get('.sidebar .tag-list').contains(uniqueTag).click();

                    // Backend'in bu filtreyi uygulayıp bize veri döndüğünü kanıtla
                    cy.wait('@getArticlesByTag').its('response.statusCode').should('eq', 200);

                    // ==========================================
                    // DURUM (STATE) VE MANTIKSAL DOĞRULAMALAR
                    // ==========================================

                    // A. State Doğrulaması: Seçilen etiket adıyla yeni ve 'aktif' bir sekme (tab) oluştuğunu onayla
                    cy.get('.feed-toggle .nav-link.active').should('contain.text', uniqueTag);

                    // B. İçerik Doğrulaması: Yarattığımız test makalesinin ekrana başarıyla düştüğünü onayla
                    cy.get('.article-preview').should('contain.text', articleTitle);

                    // C. Mantıksal Doğrulama (Loop Assertion): Altın Vuruş!
                    // Ekranda listelenen makale sayısı kaç olursa olsun, her birinin altındaki
                    // etiket listesinde bizim seçtiğimiz etiket KESİNLİKLE bulunmalıdır!
                    cy.get('.article-preview').each(($article) => {
                        cy.wrap($article).find('.tag-list').should('contain.text', uniqueTag);
                    });
                });
            });
        });
    });

    it('Author-based makaleler (Başka bir yazarın ismine tıklayarak filtreleme)', () => {
        // 1. Giriş yapıyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            cy.visit('/');

            // ==========================================
            // PRE-CONDITION: MOCKING (Kirliliği Aşmak)
            // Anasayfadaki ilk makaleyi zorla 'Artem Bondar' yapıyoruz ki tıklayacak hedefimiz olsun!
            // ==========================================
            cy.intercept('GET', '**/api/articles?limit=10&offset=0', (req) => {
                req.continue((res) => {
                    if(res.body.articles && res.body.articles.length > 0) {
                        res.body.articles[0].author.username = 'Artem Bondar';
                    }
                });
            }).as('getGlobalFeed');

            // İnisiyatif alarak 'Global Feed' sekmesine tıklıyoruz
            cy.contains('.feed-toggle .nav-link', 'Global Feed').click();
            cy.wait('@getGlobalFeed');

            // ==========================================
            // ASIL TEST BAŞLIYOR (Routing ve Filtreleme)
            // ==========================================

            // Yazar profiline girildiğinde tetiklenen spesifik filtreleme isteğini dinle
            // (URL encoding farklılıklarına karşı yazar adını dinamik yakalamak için wildcard '*' kullanıyoruz)
            cy.intercept('GET', '**/api/articles?author=*').as('getArticlesByAuthor');

            // 2. UI Etkileşimi: Anasayfadaki ilk makalenin yazarına (Artem Bondar) tıkla
            cy.get('.article-meta .author').first().should('contain.text', 'Artem Bondar').click();

            // 3. Routing (Yönlendirme) Doğrulaması: Uygulama bizi doğru URL'e götürdü mü?
            cy.url().should('include', '/profile/Artem');

            // 4. Backend Doğrulaması: Filtreleme parametresiyle API isteği başarıyla atıldı mı?
            cy.wait('@getArticlesByAuthor').its('response.statusCode').should('eq', 200);

            // 5. Logical Assertion (Mantıksal Doğrulama):
            // Profilde listelenen DİĞER TÜM makalelerin yazarı KESİNLİKLE 'Artem Bondar' olmalı.
            // Araya başka bir yazarın makalesi sızmamalı!
            cy.get('.article-preview').should('have.length.greaterThan', 0).each(($article) => {
                cy.wrap($article).find('.article-meta .author').should('contain.text', 'Artem Bondar');
            });
        });
    });

    it('Popular Tags listesinin API verisiyle dinamik olarak oluşturulması (UI Rendering)', () => {
        // 1. Giriş yapıyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            // ==========================================
            // TEST İZOLASYONU: FULL MOCKING
            // Veritabanındaki etiketleri umursamıyoruz. Frontend bileşeninin
            // verdiğimiz diziyi (array) ekrana basıp basamadığını test edeceğiz.
            // ==========================================
            const mockTags = ['sdet-vision', 'cypress-master', 'quality-gate', 'clean-code'];

            // /api/tags endpoint'ine giden isteği havada yakala ve kendi sahte cevabını dön
            cy.intercept('GET', '**/api/tags', {
                statusCode: 200,
                body: {
                    tags: mockTags
                }
            }).as('getMockTags');

            // 2. UI Etkileşimi: Anasayfaya git
            cy.visit('/');

            // Sahte verimizin uygulamanın damarlarına enjekte edildiğinden emin ol
            cy.wait('@getMockTags');

            // ==========================================
            // ARAYÜZ (UI) MANTIKSAL DOĞRULAMALARI
            // ==========================================

            // A. Uzunluk Doğrulaması: Ekrana tam olarak bizim dizimizdeki eleman sayısı kadar etiket basılmalı!
            // Ne eksik, ne fazla.
            cy.get('.sidebar .tag-list a').should('have.length', mockTags.length);

            // B. Sıra ve Metin Doğrulaması (Array Mapping Control):
            // API'den gelen dizi hangi sıradaysa, ekrandaki butonlar da aynı sırayla o metinleri içermeli.
            mockTags.forEach((tag, index) => {
                cy.get('.sidebar .tag-list a').eq(index).should('contain.text', tag);
            });
        });
    });

    it('Feed Pagination kontrolü (Sayfalama ve API Offset hesaplaması)', () => {
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            // ==========================================
            // VERİ HAZIRLIĞI (Data Mocking)
            // Sistemde yeterli makale yoksa pagination butonu çıkmaz.
            // Bu yüzden 1. ve 2. sayfalar için sahte makale dizileri üretiyoruz.
            // ==========================================

            // Sayfa 1 için 10 adet makale (Uygulamanın sayfa başı limiti 10'dur)
            const page1Articles = Array.from({ length: 10 }, (_, i) => ({
                slug: `page-1-article-${i}`,
                title: `Sayfa 1 Makalesi - ${i + 1}`,
                description: 'Pagination Testi',
                body: 'İçerik',
                tagList: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                favorited: false,
                favoritesCount: 0,
                author: { username: 'Artem Bondar', bio: null, image: 'https://api.realworld.io/images/smiley-cyrus.jpeg', following: false }
            }));

            // Sayfa 2 için 5 adet makale (Toplam 15 makale olacak)
            const page2Articles = Array.from({ length: 5 }, (_, i) => ({
                slug: `page-2-article-${i}`,
                title: `Sayfa 2 Makalesi - ${i + 1}`,
                description: 'Pagination Testi',
                body: 'İçerik',
                tagList: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                favorited: false,
                favoritesCount: 0,
                author: { username: 'Artem Bondar', bio: null, image: 'https://api.realworld.io/images/smiley-cyrus.jpeg', following: false }
            }));

            // ==========================================
            // NETWORK MOCKING (API İsteklerini Ele Geçirme)
            // ==========================================

            // 1. Sayfa İsteği: offset=0 (İlk 10 makale)
            cy.intercept('GET', '**/api/articles?limit=10&offset=0', {
                statusCode: 200,
                body: { articles: page1Articles, articlesCount: 15 } // articlesCount 15 olduğu için UI 2 adet sayfa butonu çizecektir!
            }).as('getPage1');

            // 2. Sayfa İsteği: offset=10 (Sonraki 5 makale)
            cy.intercept('GET', '**/api/articles?limit=10&offset=10', {
                statusCode: 200,
                body: { articles: page2Articles, articlesCount: 15 }
            }).as('getPage2');

            // ==========================================
            // TEST ADIMLARI VE DOĞRULAMALAR
            // ==========================================

            cy.visit('/');

            // Global Feed sekmesine geçiş yapıp 1. sayfa yüklenmesini bekle
            cy.contains('.feed-toggle .nav-link', 'Global Feed').click();
            cy.wait('@getPage1');

            // A. State Doğrulaması: Sayfalandırma (Pagination) modülü görünür olmalı ve 1. buton aktif olmalı
            cy.get('.pagination').should('be.visible');
            cy.get('.pagination .page-item.active').should('contain.text', '1');

            // İçerik Doğrulaması: Ekranda 1. sayfanın verileri olmalı
            cy.get('.article-preview').first().should('contain.text', 'Sayfa 1 Makalesi');

            // B. Aksiyon: Sayfanın en altındaki "2" numaralı butona tıkla
            cy.get('.pagination .page-link').contains('2').click();

            // C. Backend Doğrulaması: Frontend, offset'i 10 artırarak doğru API isteğini fırlattı mı?
            cy.wait('@getPage2');

            // D. Son State Doğrulaması: Tıklanan 2. buton aktif renge geçti mi?
            cy.get('.pagination .page-item.active').should('contain.text', '2');

            // E. Son İçerik Doğrulaması: Sayfa yenilenmeden ekrana Sayfa 2'nin verileri basıldı mı?
            cy.get('.article-preview').first().should('contain.text', 'Sayfa 2 Makalesi');
        });
    });

});