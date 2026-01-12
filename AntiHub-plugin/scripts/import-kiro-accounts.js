/**
 * 批量导入 Kiro 账号脚本
 * 用法: node scripts/import-kiro-accounts.js <json文件路径> [用户ID]
 * 
 * JSON 文件格式要求：
 * - 一个数组，包含多个账号对象
 * - 每个账号对象需要包含: refreshToken, clientId, clientSecret, userId, machineId 等字段
 */

import fs from 'fs';
import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;

// 数据库配置 - 从 config.json 读取
let dbConfig;
try {
    const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
    dbConfig = config.database;
} catch (error) {
    console.error('无法读取 config.json:', error.message);
    process.exit(1);
}

const pool = new Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password
});

/**
 * 解析日期字符串为 ISO 格式
 * @param {string} dateStr - 日期字符串 "2026/01/12 02:32:20"
 * @returns {string} ISO 格式日期
 */
function parseDate(dateStr) {
    if (!dateStr) return new Date().toISOString();
    // 转换 "2026/01/12 02:32:20" 为 "2026-01-12T02:32:20"
    const isoStr = dateStr.replace(/\//g, '-').replace(' ', 'T');
    return new Date(isoStr).toISOString();
}

/**
 * 解析过期时间为时间戳
 * @param {string} dateStr - 日期字符串
 * @returns {number} 时间戳毫秒
 */
function parseExpiresAt(dateStr) {
    if (!dateStr) return Date.now() + 3600000; // 默认1小时后
    const isoStr = dateStr.replace(/\//g, '-').replace(' ', 'T');
    return new Date(isoStr).getTime();
}

/**
 * 从 usageData 中提取使用量信息
 */
function extractUsageData(usageData) {
    if (!usageData) {
        return {
            subscription: 'unknown',
            current_usage: 0,
            usage_limit: 0,
            reset_date: null,
            free_trial_status: null,
            free_trial_usage: null,
            free_trial_limit: null,
            free_trial_expiry: null,
            bonus_usage: 0,
            bonus_limit: 0,
            bonus_available: 0,
            bonus_details: []
        };
    }

    // 提取订阅信息
    const subscription = usageData.subscriptionInfo?.subscriptionTitle || 'unknown';

    // 查找 CREDIT 类型的使用量
    const creditBreakdown = usageData.usageBreakdownList?.find(b => b.resourceType === 'CREDIT') || {};

    // 免费试用信息
    const freeTrialInfo = creditBreakdown.freeTrialInfo || {};

    // 重置日期
    let reset_date = null;
    if (usageData.nextDateReset) {
        reset_date = new Date(usageData.nextDateReset * 1000).toISOString();
    }

    // 免费试用过期时间
    let free_trial_expiry = null;
    if (freeTrialInfo.freeTrialExpiry) {
        free_trial_expiry = new Date(freeTrialInfo.freeTrialExpiry * 1000).toISOString();
    }

    return {
        subscription,
        current_usage: creditBreakdown.currentUsageWithPrecision || creditBreakdown.currentUsage || 0,
        usage_limit: creditBreakdown.usageLimitWithPrecision || creditBreakdown.usageLimit || 0,
        reset_date,
        free_trial_status: freeTrialInfo.freeTrialStatus === 'ACTIVE',
        free_trial_usage: freeTrialInfo.currentUsageWithPrecision || freeTrialInfo.currentUsage || null,
        free_trial_limit: freeTrialInfo.usageLimitWithPrecision || freeTrialInfo.usageLimit || null,
        free_trial_expiry,
        bonus_usage: 0,
        bonus_limit: 0,
        bonus_available: 0,
        bonus_details: []
    };
}

/**
 * 导入单个账号
 */
async function importAccount(account, userId) {
    // 从 JSON 账号格式转换为数据库格式
    const usageInfo = extractUsageData(account.usageData);

    const dbAccount = {
        account_id: account.id || crypto.randomUUID(),
        user_id: userId,
        account_name: account.label || `Kiro ${account.email || 'Unknown'} 账号`,
        auth_method: account.provider === 'BuilderId' ? 'IdC' : 'Social',
        refresh_token: account.refreshToken,
        access_token: account.accessToken || '',
        expires_at: parseExpiresAt(account.expiresAt),
        client_id: account.clientId || null,
        client_secret: account.clientSecret || null,
        profile_arn: account.profileArn || null,
        machineid: account.machineId || crypto.randomUUID(),
        is_shared: 0,
        email: account.email || account.usageData?.userInfo?.email || null,
        userid: account.userId || account.usageData?.userInfo?.userId || null,
        ...usageInfo,
        status: account.status === '正常' ? 1 : (account.status === '禁用' ? 0 : 1)
    };

    // 检查账号是否已存在（通过 userid 或 machineid 判断）
    const existingCheck = await pool.query(
        'SELECT account_id FROM kiro_accounts WHERE userid = $1 OR machineid = $2',
        [dbAccount.userid, dbAccount.machineid]
    );

    if (existingCheck.rows.length > 0) {
        console.log(`  跳过: ${dbAccount.email || dbAccount.account_name} (已存在)`);
        return { skipped: true, account_id: existingCheck.rows[0].account_id };
    }

    // 插入账号
    const insertQuery = `
    INSERT INTO kiro_accounts (
      account_id, user_id, account_name, auth_method, refresh_token, access_token,
      expires_at, client_id, client_secret, profile_arn, machineid, is_shared,
      email, userid, subscription, current_usage, usage_limit, reset_date,
      free_trial_status, free_trial_usage, free_trial_limit, free_trial_expiry,
      bonus_usage, bonus_limit, bonus_available, bonus_details, status
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
      $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
      $23, $24, $25, $26, $27
    )
    RETURNING account_id
  `;

    const result = await pool.query(insertQuery, [
        dbAccount.account_id,
        dbAccount.user_id,
        dbAccount.account_name,
        dbAccount.auth_method,
        dbAccount.refresh_token,
        dbAccount.access_token,
        dbAccount.expires_at,
        dbAccount.client_id,
        dbAccount.client_secret,
        dbAccount.profile_arn,
        dbAccount.machineid,
        dbAccount.is_shared,
        dbAccount.email,
        dbAccount.userid,
        dbAccount.subscription,
        dbAccount.current_usage,
        dbAccount.usage_limit,
        dbAccount.reset_date,
        dbAccount.free_trial_status,
        dbAccount.free_trial_usage,
        dbAccount.free_trial_limit,
        dbAccount.free_trial_expiry,
        dbAccount.bonus_usage,
        dbAccount.bonus_limit,
        dbAccount.bonus_available,
        JSON.stringify(dbAccount.bonus_details),
        dbAccount.status
    ]);

    console.log(`  导入成功: ${dbAccount.email || dbAccount.account_name}`);
    return { skipped: false, account_id: result.rows[0].account_id };
}

/**
 * 主函数
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log('用法: node scripts/import-kiro-accounts.js <json文件路径> [用户ID]');
        console.log('');
        console.log('示例:');
        console.log('  node scripts/import-kiro-accounts.js accounts.json');
        console.log('  node scripts/import-kiro-accounts.js accounts.json d95a40f2-1091-4db4-aefe-f889c3a8896b');
        process.exit(1);
    }

    const jsonFile = args[0];
    let userId = args[1];

    // 如果没有指定用户ID，获取第一个用户
    if (!userId) {
        const userResult = await pool.query('SELECT user_id FROM users WHERE status = 1 ORDER BY created_at LIMIT 1');
        if (userResult.rows.length === 0) {
            console.error('没有可用的用户，请先创建用户');
            process.exit(1);
        }
        userId = userResult.rows[0].user_id;
        console.log(`使用默认用户: ${userId}`);
    }

    // 读取 JSON 文件
    let accounts;
    try {
        const jsonContent = fs.readFileSync(jsonFile, 'utf8');
        accounts = JSON.parse(jsonContent);

        // 如果不是数组，尝试包装成数组
        if (!Array.isArray(accounts)) {
            accounts = [accounts];
        }
    } catch (error) {
        console.error(`无法读取 JSON 文件 ${jsonFile}:`, error.message);
        process.exit(1);
    }

    console.log(`读取到 ${accounts.length} 个账号`);

    // 过滤无效账号：只保留 status === '正常' 且 refreshToken 有值的账号
    const validAccounts = accounts.filter(acc => {
        if (acc.status !== '正常') {
            return false;
        }
        if (!acc.refreshToken || acc.refreshToken.trim() === '') {
            return false;
        }
        return true;
    });

    const filteredCount = accounts.length - validAccounts.length;
    if (filteredCount > 0) {
        console.log(`过滤掉 ${filteredCount} 个无效账号 (status 非正常或无 refreshToken)`);
    }

    console.log(`准备导入 ${validAccounts.length} 个有效账号到用户 ${userId}`);
    console.log('---');

    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < validAccounts.length; i++) {
        const account = validAccounts[i];
        console.log(`[${i + 1}/${validAccounts.length}] 处理: ${account.email || account.label || account.id}`);

        try {
            const result = await importAccount(account, userId);
            if (result.skipped) {
                skipped++;
            } else {
                imported++;
            }
        } catch (error) {
            console.error(`  失败: ${error.message}`);
            failed++;
        }
    }

    console.log('---');
    console.log(`导入完成: 成功=${imported}, 跳过=${skipped}, 失败=${failed}, 过滤=${filteredCount}`);

    await pool.end();
}

main().catch(error => {
    console.error('导入失败:', error.message);
    process.exit(1);
});
