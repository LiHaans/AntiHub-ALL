# Kiro BuilderId/IdC 账号额度查询 API 使用说明

## 概述

BuilderId/IdC 账号使用 AWS CodeWhisperer API 来查询账号的额度信息。此 API 需要通过 AWS OIDC 认证获取的 `access_token`。

---

## API 端点

```
GET https://codewhisperer.us-east-1.amazonaws.com/getUsageLimits
```

---

## 请求参数

### Query Parameters

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `isEmailRequired` | boolean | 是 | 固定为 `true`，返回用户邮箱信息 |
| `origin` | string | 是 | 固定为 `AI_EDITOR` |
| `resourceType` | string | 否 | 可选 `AGENTIC_REQUEST`，用于查询 Agent 请求额度 |

### Request Headers

| Header | 值 | 说明 |
|--------|-----|------|
| `Authorization` | `Bearer {access_token}` | AWS OIDC 认证 token |
| `x-amz-user-agent` | `aws-sdk-js/1.0.0 KiroIDE-{version}-{machine_id}` | 用户代理标识 |
| `user-agent` | 见下方示例 | 完整的 User-Agent |
| `amz-sdk-invocation-id` | `{uuid}` | 每次请求生成的唯一 UUID |
| `amz-sdk-request` | `attempt=1; max=1` | SDK 请求信息 |
| `Connection` | `close` | 连接设置 |

---

## 请求示例

### cURL

```bash
curl -X GET "https://codewhisperer.us-east-1.amazonaws.com/getUsageLimits?isEmailRequired=true&origin=AI_EDITOR&resourceType=AGENTIC_REQUEST" \
  -H "Authorization: Bearer eyJraWQiOiJlY2Rj..." \
  -H "x-amz-user-agent: aws-sdk-js/1.0.0 KiroIDE-0.6.18-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" \
  -H "user-agent: aws-sdk-js/1.0.0 ua/2.1 os/windows lang/js md/nodejs#20.16.0 api/codewhispererruntime#1.0.0 m/E KiroIDE-0.6.18-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" \
  -H "amz-sdk-invocation-id: $(uuidgen)" \
  -H "amz-sdk-request: attempt=1; max=1" \
  -H "Connection: close"
```

### JavaScript (Node.js)

```javascript
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

async function getUsageLimits(accessToken, machineId) {
  const kiroVersion = '0.6.18';
  const url = 'https://codewhisperer.us-east-1.amazonaws.com/getUsageLimits';
  
  const response = await axios.get(url, {
    params: {
      isEmailRequired: true,
      origin: 'AI_EDITOR',
      resourceType: 'AGENTIC_REQUEST'
    },
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'x-amz-user-agent': `aws-sdk-js/1.0.0 KiroIDE-${kiroVersion}-${machineId}`,
      'user-agent': `aws-sdk-js/1.0.0 ua/2.1 os/windows lang/js md/nodejs#20.16.0 api/codewhispererruntime#1.0.0 m/E KiroIDE-${kiroVersion}-${machineId}`,
      'amz-sdk-invocation-id': uuidv4(),
      'amz-sdk-request': 'attempt=1; max=1',
      'Connection': 'close'
    }
  });
  
  return response.data;
}
```

### Python

```python
import requests
import uuid

def get_usage_limits(access_token: str, machine_id: str) -> dict:
    kiro_version = "0.6.18"
    url = "https://codewhisperer.us-east-1.amazonaws.com/getUsageLimits"
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "x-amz-user-agent": f"aws-sdk-js/1.0.0 KiroIDE-{kiro_version}-{machine_id}",
        "user-agent": f"aws-sdk-js/1.0.0 ua/2.1 os/windows lang/js md/nodejs#20.16.0 api/codewhispererruntime#1.0.0 m/E KiroIDE-{kiro_version}-{machine_id}",
        "amz-sdk-invocation-id": str(uuid.uuid4()),
        "amz-sdk-request": "attempt=1; max=1",
        "Connection": "close"
    }
    
    params = {
        "isEmailRequired": "true",
        "origin": "AI_EDITOR",
        "resourceType": "AGENTIC_REQUEST"
    }
    
    response = requests.get(url, headers=headers, params=params)
    response.raise_for_status()
    return response.json()
```

---

## 响应结构

### 成功响应 (HTTP 200)

```json
{
  "daysUntilReset": 25,
  "nextDateReset": 1738339200000,
  "userInfo": {
    "email": "user@example.com",
    "userId": "amzn1.account.AXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },
  "subscriptionInfo": {
    "subscriptionTitle": "Kiro Pro",
    "type": "PRO",
    "overageCapability": "ENABLED",
    "upgradeCapability": "ENABLED",
    "subscriptionManagementTarget": "AWS_CONSOLE"
  },
  "usageBreakdownList": [
    {
      "usageLimit": 1000,
      "currentUsage": 150,
      "usageLimitWithPrecision": 1000.0,
      "currentUsageWithPrecision": 150.5,
      "nextDateReset": 1738339200000,
      "freeTrialInfo": {
        "usageLimit": 50,
        "currentUsage": 0,
        "freeTrialExpiry": 1735689600000,
        "freeTrialStatus": "ACTIVE"
      },
      "bonuses": [
        {
          "bonusCode": "WELCOME_BONUS",
          "displayName": "Welcome Bonus",
          "usageLimit": 100.0,
          "currentUsage": 50.0,
          "expiresAt": 1740000000000,
          "status": "ACTIVE"
        }
      ],
      "overageRate": 0.01,
      "overageCap": 50,
      "displayName": "Agentic Request",
      "displayNamePlural": "Agentic Requests",
      "resourceType": "AGENTIC_REQUEST",
      "unit": "request",
      "currency": "USD"
    }
  ],
  "overageConfiguration": {
    "overageStatus": "DISABLED"
  }
}
```

### 响应字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `daysUntilReset` | int | 距离额度重置的天数 |
| `nextDateReset` | long | 下次重置时间 (Unix 毫秒时间戳) |
| `userInfo.email` | string | 用户邮箱 |
| `userInfo.userId` | string | AWS 用户 ID |
| `subscriptionInfo.type` | string | 订阅类型: `FREE` / `PRO` / `PRO_PLUS` |
| `usageBreakdownList[0].usageLimit` | int | 总额度 |
| `usageBreakdownList[0].currentUsage` | int | 已使用额度 |
| `usageBreakdownList[0].freeTrialInfo` | object | 免费试用信息 |
| `usageBreakdownList[0].bonuses` | array | 赠送的额度列表 |

### 计算剩余额度

```javascript
const breakdown = response.usageBreakdownList[0];
const mainLimit = breakdown.usageLimit || 0;
const mainUsed = breakdown.currentUsage || 0;

// 免费试用额度
const trialLimit = breakdown.freeTrialInfo?.usageLimit || 0;
const trialUsed = breakdown.freeTrialInfo?.currentUsage || 0;

// 赠送额度
const bonusLimit = breakdown.bonuses?.reduce((sum, b) => sum + (b.usageLimit || 0), 0) || 0;
const bonusUsed = breakdown.bonuses?.reduce((sum, b) => sum + (b.currentUsage || 0), 0) || 0;

// 总额度和总已用
const totalLimit = mainLimit + trialLimit + bonusLimit;
const totalUsed = mainUsed + trialUsed + bonusUsed;
const remaining = totalLimit - totalUsed;
```

---

## 错误处理

### 账号被封禁 (HTTP 403)

```json
{
  "reason": "ACCOUNT_SUSPENDED",
  "message": "Your account has been suspended"
}
```

### Token 过期 (HTTP 401)

需要使用 `refresh_token` 重新获取 `access_token`。

---

## 获取 Access Token

BuilderId 账号的 `access_token` 通过 AWS OIDC 获取：

```
POST https://oidc.us-east-1.amazonaws.com/token

Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
client_id={client_id}
client_secret={client_secret}
refresh_token={refresh_token}
```

其中 `client_id` 和 `client_secret` 是注册 OIDC 客户端时获取的凭证。

---

## 注意事项

1. **machine_id**: 建议使用固定的 UUID 格式字符串，用于标识设备
2. **Kiro 版本号**: 建议使用最新的 Kiro IDE 版本号 (如 `0.6.18`)
3. **请求频率**: 避免频繁调用，建议缓存结果并定期刷新
4. **Token 有效期**: `access_token` 有效期通常为 1 小时，过期后需刷新
