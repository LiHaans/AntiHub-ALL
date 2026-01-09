import logger from '../utils/logger.js';

const QWEN_OAUTH_TOKEN_ENDPOINT = 'https://chat.qwen.ai/api/v1/oauth2/token';
// 来自参考项目 CLIProxyAPI 的 Qwen OAuth client_id（Qwen Code）
const QWEN_OAUTH_CLIENT_ID = 'f0304373b74a44d2b584a3fb70ca9e56';

class QwenService {
  /**
   * 使用 refresh_token 刷新 access_token
   * @param {string} refresh_token
   * @returns {Promise<{access_token:string, refresh_token?:string, token_type?:string, resource_url?:string, expires_in?:number}>}
   */
  async refreshAccessToken(refresh_token) {
    const normalized = typeof refresh_token === 'string' ? refresh_token.trim() : '';
    if (!normalized) {
      const err = new Error('refresh_token不能为空');
      err.isInvalidGrant = true;
      throw err;
    }

    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('client_id', QWEN_OAUTH_CLIENT_ID);
    body.set('refresh_token', normalized);

    const resp = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });

    const raw = await resp.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }

    if (!resp.ok) {
      const errorType = data?.error || '';
      const errorDesc = data?.error_description || raw || `HTTP ${resp.status}`;

      const err = new Error(`Qwen refresh token 失败: ${errorType} ${errorDesc}`.trim());
      // OAuth 常见错误
      if (errorType === 'invalid_grant') {
        err.isInvalidGrant = true;
      }
      err.statusCode = resp.status;
      err.response = data || raw;
      throw err;
    }

    if (!data || typeof data.access_token !== 'string' || !data.access_token.trim()) {
      throw new Error('Qwen refresh token 响应缺少 access_token');
    }

    return {
      access_token: data.access_token,
      refresh_token: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
      token_type: typeof data.token_type === 'string' ? data.token_type : undefined,
      resource_url: typeof data.resource_url === 'string' ? data.resource_url : undefined,
      expires_in: typeof data.expires_in === 'number' ? data.expires_in : undefined,
    };
  }

  /**
   * 规范化 resource_url：允许传入 portal.qwen.ai 或 https://portal.qwen.ai
   * @param {string|null|undefined} resource_url
   * @returns {string}
   */
  normalizeResourceURL(resource_url) {
    if (typeof resource_url !== 'string' || !resource_url.trim()) {
      return 'portal.qwen.ai';
    }
    return resource_url.trim().replace(/^https?:\/\//i, '');
  }

  /**
   * 将 QwenCli 导出的 expired 字段解析成毫秒时间戳
   * @param {string|null|undefined} expired
   * @returns {number|null}
   */
  parseExpiredToMillis(expired) {
    if (typeof expired !== 'string' || !expired.trim()) return null;
    const t = Date.parse(expired.trim());
    if (Number.isNaN(t)) return null;
    return t;
  }

  /**
   * 为导入流程提供一层兜底的、可读的错误日志（避免把 token 打到日志里）
   * @param {Error} error
   */
  logSafeError(error) {
    const message = typeof error?.message === 'string' ? error.message : String(error);
    logger.warn(`QwenService error: ${message}`);
  }
}

const qwenService = new QwenService();
export default qwenService;

