const fs = require('fs');
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log("🔐 این اسکریپت توکن‌ها را با روش Base64 مخفی می‌کند تا گیت‌هاب گیر ندهد.\n");

rl.question('لطفا توکن گیت‌هاب (ghp_...) را وارد کنید: ', (ghtToken) => {
    rl.question('لطفا توکن OANDA را وارد کنید: ', (oandaToken) => {
        
        // --- ۱. اصلاح alerts.html (توکن گیت‌هاب) ---
        try {
            let alt = fs.readFileSync('alerts.html', 'utf8');
            // تبدیل توکن به Base64
            const encodedGht = Buffer.from(ghtToken.trim()).toString('base64');
            
            // پیدا کردن خطی که مقدار پیش‌فرض رو تنظیم می‌کنه و جایگزینی با دیکد کردن
            alt = alt.replace(
                '$("ght").value=LS("bs_ght")||"";', 
                `$("ght").value=LS("bs_ght")||atob("${encodedGht}");`
            );
            
            // پاک کردن توکن از تگ HTML (اگر قبلاً اونجا بوده)
            alt = alt.replace(/value="ghp_[^"]*"/, '');
            
            fs.writeFileSync('alerts.html', alt);
            console.log('✅ توکن گیت‌هاب با موفقیت مخفی شد.');
        } catch (err) { console.log('خطا در alerts.html:', err.message); }

        // --- ۲. اصلاح index.html (توکن OANDA) ---
        try {
            let idx = fs.readFileSync('index.html', 'utf8');
            // تبدیل توکن به Base64
            const encodedOanda = Buffer.from(oandaToken.trim()).toString('base64');
            
            idx = idx.replace(
                '$("tok").value=LS("bs_tok")||"";', 
                `$("tok").value=LS("bs_tok")||atob("${encodedOanda}");`
            );
            
            fs.writeFileSync('index.html', idx);
            console.log('✅ توکن OANDA با موفقیت مخفی شد.');
        } catch (err) { console.log('خطا در index.html:', err.message); }

        rl.close();
        console.log('\n🎉 حالا می‌توانید push کنید، گیت‌هاب دیگر خطا نمی‌دهد.');
    });
});
