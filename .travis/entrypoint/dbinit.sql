CREATE USER 'bob'@'%';
GRANT ALL ON *.* TO 'bob'@'%' with grant option;

CREATE USER 'boby'@'%' identified by 'hey';
GRANT ALL ON *.* TO 'boby'@'%' with grant option;

INSTALL PLUGIN pam SONAME 'auth_pam';

FLUSH PRIVILEGES;

CREATE DATABASE test2;