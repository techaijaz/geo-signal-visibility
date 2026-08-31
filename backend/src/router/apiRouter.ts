import { Router } from 'express'
import apiController from '../controller/apiController'
import rateLimit from '../middleware/rateLimit'
import userController from '../controller/userController'
import brandController from '../controller/brandController'
import mentionController from '../controller/mentionController'
import subscriptionController from '../controller/subscriptionController'
import auditController from '../controller/auditController'
import recommendationController from '../controller/recommendationController'
import reportController from '../controller/reportController'
import overviewController from '../controller/overviewController'
import categoryController from '../controller/categoryController'
import adminController from '../controller/adminController'
import publicController from '../controller/publicController'
import jobController from '../controller/jobController'
import authentication from '../middleware/authentication'
import adminOnly from '../middleware/adminOnly'

const router = Router()

router.use(rateLimit)
router.route('/self').get(apiController.self)
router.route('/health').get(apiController.health)

// Public Free Checker router
router.route('/free-check').post(publicController.freeCheck)

// Job Status router
router.route('/jobs/:queueName/:jobId').get(authentication, jobController.getJobStatus)

//User router
router.route('/register').post(userController.register)
router.route('/confirmation/:token').put(userController.confirmation)
router.route('/resend-confirmation').post(userController.resendConfirmation)
router.route('/login').post(userController.login).get(userController.login)
router.route('/self-identification').get(authentication, userController.selfIdentification)
router.route('/logout').put(authentication, userController.logout)
router.route('/refresh-token').post(userController.refresshToken)
router.route('/auth/refresh').post(userController.refresshToken)
router.route('/forgot-password').put(userController.forgotPassword)
router.route('/reset-password/:token').put(userController.resetPassword)
router.route('/change-password').put(authentication, userController.changePassword)
router.route('/update-profile').put(authentication, userController.updateProfile)

//Org & Brand router
router.route('/orgs/brands').get(authentication, brandController.getWorkspaceBrands)
router.route('/brands').post(authentication, brandController.createBrand)
router
    .route('/brands/:id')
    .get(authentication, brandController.getBrandById)
    .patch(authentication, brandController.updateBrand)
    .delete(authentication, brandController.deleteBrand)

router.route('/brands/:id/overview').get(authentication, overviewController.getBrandOverview)
router.route('/brands/:id/mentions').get(authentication, mentionController.getBrandMentions)
router.route('/brands/:id/mentions/rescan').post(authentication, mentionController.rescanMentions)
router.route('/brands/:id/competitors/compare').get(authentication, brandController.getCompetitorComparison)
router.route('/brands/:id/audit').get(authentication, auditController.getBrandAudit)
router.route('/brands/:id/audit/rescan').post(authentication, auditController.rescanBrandAudit)
router.route('/brands/:id/recommendations').get(authentication, recommendationController.getBrandRecommendations)
router.route('/brands/:id/recommendations/:recId/toggle').patch(authentication, recommendationController.toggleRecommendation)
router.route('/brands/:id/recommendations/rescan').post(authentication, recommendationController.rescanBrandRecommendations)

// Reports router
router.route('/brands/:id/reports').get(authentication, reportController.getBrandReports)
router.route('/brands/:id/reports/generate').post(authentication, reportController.generateReport)
router.route('/brands/:id/reports/:reportId/download').get(authentication, reportController.downloadReportPdf)
router.route('/brands/:id/reports/share').post(authentication, reportController.addShareEmail)
router.route('/brands/:id/reports/share/:email').delete(authentication, reportController.removeShareEmail)

// Subscription router
router.route('/subscription').get(authentication, subscriptionController.getSubscription)
router.route('/subscription/change').post(authentication, subscriptionController.updateSubscription)
router.route('/subscription/checkout').post(authentication, subscriptionController.createCheckoutSession)
router.route('/subscription/confirm').post(authentication, subscriptionController.confirmPayment)
router.route('/subscription/invoices').get(authentication, subscriptionController.getInvoices)
router.route('/subscription/limits').get(authentication, subscriptionController.getPlanLimits)

// Category router (Public)
router.route('/categories').get(categoryController.getCategories)

// AI Models router (Authenticated)
router.route('/ai-models').get(authentication, adminController.getAiModels)

// Admin Protected Routes
router.route('/admin/stats').get(authentication, adminOnly, adminController.getStats)

// Admin User & Subscription Management
router.route('/admin/users').get(authentication, adminOnly, adminController.getUsers)
router.route('/admin/users/:id/role').patch(authentication, adminOnly, adminController.updateUserRole)
router.route('/admin/users/:id/plan').patch(authentication, adminOnly, adminController.updateUserPlan)
router.route('/admin/users/:id').delete(authentication, adminOnly, adminController.deleteUser)

// Admin AI Models Management
router.route('/admin/ai-models').get(authentication, adminOnly, adminController.getAiModels)
router.route('/admin/ai-models').post(authentication, adminOnly, adminController.createAiModel)
router.route('/admin/ai-models/:id').patch(authentication, adminOnly, adminController.updateAiModel)
router.route('/admin/ai-models/:id').delete(authentication, adminOnly, adminController.deleteAiModel)

// Admin Categories Management
router.route('/admin/categories').get(authentication, adminOnly, categoryController.getAllCategories)
router.route('/admin/categories').post(authentication, adminOnly, categoryController.createCategory)
router.route('/admin/categories/:id').patch(authentication, adminOnly, categoryController.updateCategory)
router.route('/admin/categories/:id').delete(authentication, adminOnly, categoryController.deleteCategory)

// Admin Cost Logs & API Usage
router.route('/admin/cost-logs').get(authentication, adminOnly, adminController.getCostLogs)

// Admin Encrypted API Keys Management
router.route('/admin/api-keys').get(authentication, adminOnly, adminController.getApiKeys)
router.route('/admin/api-keys').post(authentication, adminOnly, adminController.saveApiKey)
router.route('/admin/api-keys/:provider').delete(authentication, adminOnly, adminController.deleteApiKey)

// Admin Billing & Subscriptions Management
router.route('/admin/billing/stats').get(authentication, adminOnly, adminController.getBillingStats)
router.route('/admin/billing/invoices').get(authentication, adminOnly, adminController.getAdminInvoices)
router.route('/admin/billing/invoices/:id/status').patch(authentication, adminOnly, adminController.updateInvoiceStatus)
router.route('/admin/billing/invoices/generate').post(authentication, adminOnly, adminController.createAdminInvoice)

export default router
