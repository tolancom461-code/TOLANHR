import mysql.connector
import os

db_url = "mysql://24yVnB8NmZGjEKv.root:K1a0ixgKHzrprt6f@gateway01.eu-central-1.prod.aws.tidbcloud.com:4000/test"
# Parse URL manually for mysql-connector
user = "24yVnB8NmZGjEKv.root"
password = "K1a0ixgKHzrprt6f"
host = "gateway01.eu-central-1.prod.aws.tidbcloud.com"
port = 4000
database = "test"

try:
    conn = mysql.connector.connect(
        user=user,
        password=password,
        host=host,
        port=port,
        database=database,
        ssl_disabled=False,
        ssl_verify_cert=False # TiDB Cloud usually needs this if not providing CA
    )
    cursor = conn.cursor()
    
    sql_notif = """
    CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type ENUM('success', 'warning', 'info', 'error') DEFAULT 'info' NOT NULL,
        link VARCHAR(255),
        is_read TINYINT DEFAULT 0 NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        INDEX idx_notifications_user_id (user_id),
        INDEX idx_notifications_is_read (is_read)
    );
    """
    
    sql_push = """
    CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        endpoint TEXT NOT NULL,
        p256dh VARCHAR(255) NOT NULL,
        auth VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        INDEX idx_push_subs_user_id (user_id)
    );
    """
    
    cursor.execute(sql_notif)
    cursor.execute(sql_push)
    conn.commit()
    print("Tables created successfully!")
    
except Exception as e:
    print(f"Error: {e}")
finally:
    if 'conn' in locals() and conn.is_connected():
        cursor.close()
        conn.close()
