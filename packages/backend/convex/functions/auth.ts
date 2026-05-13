import { i18n } from "@better-auth/i18n";
import { username } from "better-auth/plugins";
import { convex } from "kitcn/auth";

import { getEnv } from "../lib/get-env";
import authConfig from "./auth.config";
import { defineAuth } from "./generated/auth";

export default defineAuth(() => ({
	emailAndPassword: {
		enabled: true,
	},
	// First entry is the "primary" app — Better Auth uses it for generated
	// links (emails, redirects). Additional entries (e.g. admin dashboard) are
	// only honored via `trustedOrigins` below.
	baseURL: getEnv().SITE_URLS[0],
	user: {
		additionalFields: {
			// Tells Better Auth the `user` table has a custom `role` column so
			// the adapter loads it onto the session user — otherwise the convex
			// plugin's `definePayload` wouldn't see it and it'd never make it
			// into the JWT.
			role: {
				type: "string",
				required: true,
				defaultValue: "user",
				input: false,
			},
		},
	},
	plugins: [
		convex({
			authConfig,
			jwks: getEnv().JWKS,
			jwt: {
				// Mirror the convex plugin default (spread user minus id/image),
				// then pin `role` + `username` explicitly so they're guaranteed in
				// every JWT and survive if the default payload shape ever changes
				// upstream. `displayUsername` intentionally stays out of the JWT —
				// frontend gates don't need it and smaller payloads are cheaper.
				definePayload: ({ user }) => ({
					name: user.name,
					email: user.email,
					emailVerified: user.emailVerified,
					createdAt: user.createdAt,
					updatedAt: user.updatedAt,
					role: user.role,
					username: user.username,
				}),
			},
		}),
		username(),
		i18n({
			defaultLocale: "zh",
			translations: {
				zh: {
					USER_NOT_FOUND: "用户不存在",
					FAILED_TO_CREATE_USER: "创建用户失败",
					FAILED_TO_CREATE_SESSION: "创建会话失败",
					FAILED_TO_UPDATE_USER: "更新用户信息失败",
					FAILED_TO_GET_SESSION: "获取会话失败",
					INVALID_PASSWORD: "密码错误",
					INVALID_EMAIL: "邮箱格式不正确",
					INVALID_EMAIL_OR_PASSWORD: "邮箱或密码错误",
					INVALID_USER: "用户无效",
					INVALID_TOKEN: "令牌无效",
					TOKEN_EXPIRED: "令牌已过期",
					USER_EMAIL_NOT_FOUND: "未找到用户邮箱",
					EMAIL_NOT_VERIFIED: "邮箱未验证",
					PASSWORD_TOO_SHORT: "密码过短",
					PASSWORD_TOO_LONG: "密码过长",
					USER_ALREADY_EXISTS: "用户已存在",
					USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "用户已存在,请更换邮箱",
					CREDENTIAL_ACCOUNT_NOT_FOUND: "未找到账号凭据",
					SESSION_EXPIRED: "会话已过期,请重新登录",
					ACCOUNT_NOT_FOUND: "账号不存在",
					EMAIL_ALREADY_VERIFIED: "邮箱已验证",
					EMAIL_CAN_NOT_BE_UPDATED: "邮箱无法修改",
					EMAIL_MISMATCH: "邮箱不匹配",
					PASSWORD_ALREADY_SET: "已设置过密码",
					USER_ALREADY_HAS_PASSWORD: "用户已设置密码，请提供以删除账户",
					SESSION_NOT_FRESH: "会话状态不够新，请重新登录",
					VERIFICATION_EMAIL_NOT_ENABLED: "邮箱验证功能未启用",
					FAILED_TO_CREATE_VERIFICATION: "创建验证记录失败",
					INVALID_ORIGIN: "来源无效",
					MISSING_OR_NULL_ORIGIN: "缺少 Origin",
					CROSS_SITE_NAVIGATION_LOGIN_BLOCKED: "跨站登录被阻止",
					INVALID_CALLBACK_URL: "回调地址无效",
					INVALID_REDIRECT_URL: "重定向地址无效",
					INVALID_ERROR_CALLBACK_URL: "错误回调地址无效",
					INVALID_NEW_USER_CALLBACK_URL: "新用户回调地址无效",
					CALLBACK_URL_REQUIRED: "回调地址必填",
					VALIDATION_ERROR: "校验失败",
					MISSING_FIELD: "缺少必填字段",
					FIELD_NOT_ALLOWED: "该字段不允许设置",
					BODY_MUST_BE_AN_OBJECT: "请求体必须是对象",
					ASYNC_VALIDATION_NOT_SUPPORTED: "不支持异步校验",
					METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED:
						"POST 方法需开启 deferSessionRefresh",
					UNEXPECTED_ERROR: "发生未知错误",
					INVALID_USERNAME_OR_PASSWORD: "用户名或密码错误",
					USERNAME_IS_ALREADY_TAKEN: "用户名已被使用，请更换",
					USERNAME_TOO_SHORT: "用户名过短",
					USERNAME_TOO_LONG: "用户名过长",
					INVALID_USERNAME: "用户名格式不正确",
					INVALID_DISPLAY_USERNAME: "显示名称格式不正确",
				},
			},
		}),
	],
	session: {
		expiresIn: 60 * 60 * 24 * 30,
		updateAge: 60 * 60 * 24 * 15,
	},
	telemetry: { enabled: false },
	trustedOrigins:
		getEnv().DEPLOY_ENV === "development"
			? ["http://localhost:*", "https://*.localhost"]
			: getEnv().SITE_URLS,
}));
