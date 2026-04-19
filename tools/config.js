const path = require('path');

module.exports = {
  LOGIN_URL: 'https://account.shouyangfruit.com/user/login',
  HOME_URL: 'https://account-new.shouyangfruit.com/galaxy-group/setting-center/home',
  CURRENT_USER_API: 'https://account-new.shouyangfruit.com/earth-gateway/galaxy-group/business/nhsoft.galaxy.group.company.user.current.read',
  GALAXY_TOKEN_KEY: 'LEMON_EARTH_GALAXY_TOKEN',
  DOMAIN_REGEX: /shouyangfruit\.com/,
  SUPPLIER_URL: 'https://account-new.shouyangfruit.com/galaxy-group/setting-center/supplier',
  PRODUCT_URL: 'https://account-new.shouyangfruit.com/galaxy-group/setting-center/product/product-info',
  LOG_DIR: path.resolve(__dirname, '..', 'logs'),
};
