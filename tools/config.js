const path = require('path');

module.exports = {
  LOGIN_URL: 'https://account.shouyangfruit.com/user/login',
  HOME_URL: 'https://account-new.shouyangfruit.com/galaxy-group/setting-center/home',
  CURRENT_USER_API: 'https://account-new.shouyangfruit.com/earth-gateway/galaxy-group/business/nhsoft.galaxy.group.company.user.current.read',
  GALAXY_TOKEN_KEY: 'LEMON_EARTH_GALAXY_TOKEN',
  DOMAIN_REGEX: /shouyangfruit\.com/,
  YZJ_LOGIN_URL: 'https://www.yunzhijia.com/home/?m=open&a=login&utm_source=&utm_medium=',
  YZJ_HOME_URL: 'https://www.yunzhijia.com/yzj-layout/home/',
  YZJ_LOGIN_SUCCESS_SELECTOR: '.yl-home-nav_auto > .nav_auto_item[data-url="/manage-web/"][data-app="manage"]',
  YZJ_ACCOUNT_API_PATH: '/space/c/rest/mycloudhome/getMyAccount',
  SUPPLIER_URL: 'https://account-new.shouyangfruit.com/galaxy-group/setting-center/supplier',
  PRODUCT_URL: 'https://account-new.shouyangfruit.com/galaxy-group/setting-center/product/product-info',
  LOG_DIR: path.resolve(__dirname, '..', 'logs'),
};
