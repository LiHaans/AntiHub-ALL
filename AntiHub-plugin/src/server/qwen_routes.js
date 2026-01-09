import express from 'express';
import qwenAccountService from '../services/qwen_account.service.js';
import qwenService from '../services/qwen.service.js';
import userService from '../services/user.service.js';
import logger from '../utils/logger.js';
import config from '../config/config.js';

const router = express.Router();

/**
 * API Key认证中间件
 */
const authenticateApiKey = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '缺少Authorization请求头' });
  }

  const apiKey = authHeader.slice(7);

  // 管理员Key
  if (apiKey === config.security?.adminApiKey) {
    req.isAdmin = true;
    req.user = { user_id: 'admin', api_key: apiKey };
    return next();
  }

  const user = await userService.validateApiKey(apiKey);
  if (!user) {
    return res.status(401).json({ error: '无效的API Key' });
  }

  req.user = user;
  req.isAdmin = false;
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.isAdmin) {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
};

function toSafeAccount(account) {
  if (!account) return null;
  return {
    account_id: account.account_id,
    user_id: account.user_id,
    is_shared: account.is_shared,
    status: account.status,
    need_refresh: account.need_refresh,
    expires_at: account.expires_at,
    email: account.email,
    account_name: account.account_name,
    resource_url: account.resource_url,
    last_refresh: account.last_refresh,
    created_at: account.created_at,
    updated_at: account.updated_at,
  };
}

/**
 * 导入 QwenCli 导出的 JSON
 * POST /api/qwen/accounts/import
 * Body: { is_shared, credential_json } 或 { is_shared, credential }
 */
router.post('/api/qwen/accounts/import', authenticateApiKey, async (req, res) => {
  try {
    const { is_shared = 0, credential_json, credential, account_name } = req.body || {};

    if (is_shared !== 0 && is_shared !== 1) {
      return res.status(400).json({ error: 'is_shared必须是0或1' });
    }

    let creds = credential;
    if (!creds && typeof credential_json === 'string') {
      try {
        creds = JSON.parse(credential_json);
      } catch {
        return res.status(400).json({ error: 'credential_json不是有效JSON' });
      }
    }

    if (!creds || typeof creds !== 'object') {
      return res.status(400).json({ error: '缺少credential或credential_json' });
    }

    const type = typeof creds.type === 'string' ? creds.type.trim() : '';
    if (type && type !== 'qwen') {
      return res.status(400).json({ error: '只支持type=qwen的凭证文件' });
    }

    const accessToken = typeof creds.access_token === 'string' ? creds.access_token.trim() : '';
    if (!accessToken) {
      return res.status(400).json({ error: '缺少access_token' });
    }

    const refreshToken = typeof creds.refresh_token === 'string' ? creds.refresh_token.trim() : null;
    const email = typeof creds.email === 'string' ? creds.email.trim() : null;
    const resourceURL = qwenService.normalizeResourceURL(creds.resource_url);
    const expiresAt = qwenService.parseExpiredToMillis(creds.expired);
    const lastRefresh = typeof creds.last_refresh === 'string' ? creds.last_refresh.trim() : null;

    const name =
      (typeof account_name === 'string' ? account_name.trim() : '') ||
      email ||
      'Qwen Account';

    const account = await qwenAccountService.createAccount({
      user_id: req.user.user_id,
      account_name: name,
      is_shared,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      last_refresh: lastRefresh,
      resource_url: resourceURL,
      email,
    });

    res.json({
      success: true,
      message: 'Qwen账号导入成功',
      data: toSafeAccount(account),
    });
  } catch (error) {
    logger.error('导入Qwen账号失败:', error.message);
    const message = typeof error?.message === 'string' ? error.message : '导入失败';
    res.status(400).json({ error: message });
  }
});

/**
 * 获取当前用户的Qwen账号列表
 * GET /api/qwen/accounts
 */
router.get('/api/qwen/accounts', authenticateApiKey, async (req, res) => {
  try {
    const accounts = await qwenAccountService.getAccountsByUserId(req.user.user_id);
    res.json({ success: true, data: accounts.map(toSafeAccount) });
  } catch (error) {
    logger.error('获取Qwen账号列表失败:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取单个Qwen账号
 * GET /api/qwen/accounts/:account_id
 */
router.get('/api/qwen/accounts/:account_id', authenticateApiKey, async (req, res) => {
  try {
    const { account_id } = req.params;
    const account = await qwenAccountService.getAccountById(account_id);
    if (!account) {
      return res.status(404).json({ error: '账号不存在' });
    }
    if (!req.isAdmin && account.user_id !== req.user.user_id) {
      return res.status(403).json({ error: '无权访问该账号' });
    }
    res.json({ success: true, data: toSafeAccount(account) });
  } catch (error) {
    logger.error('获取Qwen账号失败:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 更新Qwen账号状态
 * PUT /api/qwen/accounts/:account_id/status
 * Body: { status }
 */
router.put('/api/qwen/accounts/:account_id/status', authenticateApiKey, async (req, res) => {
  try {
    const { account_id } = req.params;
    const { status } = req.body || {};
    if (status !== 0 && status !== 1) {
      return res.status(400).json({ error: 'status必须是0或1' });
    }

    const account = await qwenAccountService.getAccountById(account_id);
    if (!account) return res.status(404).json({ error: '账号不存在' });
    if (!req.isAdmin && account.user_id !== req.user.user_id) {
      return res.status(403).json({ error: '无权操作该账号' });
    }

    const updated = await qwenAccountService.updateAccountStatus(account_id, status);
    res.json({ success: true, message: '账号状态已更新', data: toSafeAccount(updated) });
  } catch (error) {
    logger.error('更新Qwen账号状态失败:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 修改Qwen账号名称
 * PUT /api/qwen/accounts/:account_id/name
 * Body: { account_name }
 */
router.put('/api/qwen/accounts/:account_id/name', authenticateApiKey, async (req, res) => {
  try {
    const { account_id } = req.params;
    const { account_name } = req.body || {};
    if (!account_name || typeof account_name !== 'string' || !account_name.trim()) {
      return res.status(400).json({ error: 'account_name不能为空' });
    }

    const account = await qwenAccountService.getAccountById(account_id);
    if (!account) return res.status(404).json({ error: '账号不存在' });
    if (!req.isAdmin && account.user_id !== req.user.user_id) {
      return res.status(403).json({ error: '无权操作该账号' });
    }

    const updated = await qwenAccountService.updateAccountName(account_id, account_name);
    res.json({ success: true, message: '账号名称已更新', data: toSafeAccount(updated) });
  } catch (error) {
    logger.error('更新Qwen账号名称失败:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 删除Qwen账号
 * DELETE /api/qwen/accounts/:account_id
 */
router.delete('/api/qwen/accounts/:account_id', authenticateApiKey, async (req, res) => {
  try {
    const { account_id } = req.params;
    const account = await qwenAccountService.getAccountById(account_id);
    if (!account) return res.status(404).json({ error: '账号不存在' });
    if (!req.isAdmin && account.user_id !== req.user.user_id) {
      return res.status(403).json({ error: '无权操作该账号' });
    }
    await qwenAccountService.deleteAccount(account_id);
    res.json({ success: true, message: '账号已删除' });
  } catch (error) {
    logger.error('删除Qwen账号失败:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 管理员：列出所有Qwen账号（用于排障）
 * GET /api/qwen/admin/accounts
 */
router.get('/api/qwen/admin/accounts', authenticateApiKey, requireAdmin, async (req, res) => {
  try {
    const result = await qwenAccountService.getAvailableAccounts(null, null);
    res.json({ success: true, data: result.map(toSafeAccount) });
  } catch (error) {
    logger.error('管理员查询Qwen账号失败:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;

