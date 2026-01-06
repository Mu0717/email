const API_BASE = '';
        let currentUser = null;
        let currentPage = 1;
        let totalEmails = 0;
        let savedAccounts = JSON.parse(localStorage.getItem('savedAccounts') || '{}');
        let adminPassword = localStorage.getItem('adminPassword');

        function formatEmailDate (dateString) {
            try {
                if (!dateString) return '未知时间';

                // 处理各种可能的日期格式
                let date = new Date(dateString);

                // 验证日期是否有效
                if (isNaN(date.getTime())) {
                    // 尝试解析ISO格式但没有时区信息的情况
                    if (dateString.includes('T') && !dateString.includes('Z') && !dateString.includes('+')) {
                        date = new Date(dateString + 'Z');
                    }

                    if (isNaN(date.getTime())) {
                        return '日期格式错误';
                    }
                }

                const now = new Date();
                const diffMs = now - date;
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

                // 根据时间差显示不同格式
                if (diffDays === 0) {
                    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                } else if (diffDays === 1) {
                    return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                } else if (diffDays < 7) {
                    return `${diffDays}天前`;
                } else if (diffDays < 365) {
                    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
                } else {
                    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
                }
            } catch (error) {
                console.error('Date formatting error:', error, 'Original date:', dateString);
                return '时间解析失败';
            }
        }

        function showError (msg) {
            const existing = document.querySelector('.error');
            if (existing) existing.remove();

            const error = document.createElement('div');
            error.className = 'error';
            error.textContent = msg;
            document.querySelector('.container').insertBefore(error, document.querySelector('.card'));
            setTimeout(() => error.remove(), 5000);
        }

        function showSuccess (msg) {
            const existing = document.querySelector('.success');
            if (existing) existing.remove();

            const success = document.createElement('div');
            success.className = 'success';
            success.textContent = msg;
            document.querySelector('.container').insertBefore(success, document.querySelector('.card'));
            setTimeout(() => success.remove(), 3000);
        }

        // ============================================================================
        // 极简认证管理函数
        // ============================================================================

        function setAdminPassword (password) {
            adminPassword = password;
            localStorage.setItem('adminPassword', password);
        }

        function clearAdminPassword () {
            adminPassword = null;
            localStorage.removeItem('adminPassword');
        }

        function isPasswordSet () {
            return adminPassword && adminPassword.length > 0;
        }

        async function adminLogin () {
            const password = document.getElementById('adminPassword').value;
            if (!password) {
                showError('请输入管理密码');
                return;
            }

            try {
                // 通过尝试调用API来验证密码
                const response = await fetch(`${API_BASE}/auth/config`, {
                    headers: {
                        'Authorization': `Bearer ${password}`
                    }
                });

                if (!response.ok) {
                    throw new Error('管理密码错误');
                }

                setAdminPassword(password);
                showEmailManagement();
                showSuccess('管理员登录成功');

            } catch (error) {
                showError('管理员登录失败: ' + error.message);
            }
        }

        function handleAdminPasswordKeyPress (event) {
            if (event.key === 'Enter') {
                adminLogin();
            }
        }

        function showAdminLogin () {
            document.getElementById('adminLoginCard').classList.remove('hidden');
            document.getElementById('loginCard').classList.add('hidden');
            document.getElementById('emailCard').classList.add('hidden');
            document.getElementById('detailCard').classList.add('hidden');
            document.getElementById('adminPassword').focus();
        }

        function showEmailManagement () {
            document.getElementById('adminLoginCard').classList.add('hidden');
            document.getElementById('loginCard').classList.remove('hidden');

            // 切换到账户管理标签页并加载账户列表
            switchTab('manage');
            loadAccountList();
        }

        function switchTab (tab) {
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));

            // 找到对应的按钮并激活
            document.querySelectorAll('.tab-btn').forEach(btn => {
                if (btn.textContent === (tab === 'single' ? '单账户登录' : tab === 'batch' ? '批量登录' : '账户管理')) {
                    btn.classList.add('active');
                }
            });

            // 显示对应的内容区域
            const contentId = tab === 'single' ? 'singleLogin' : tab === 'batch' ? 'batchLogin' : 'accountManage';
            document.getElementById(contentId).classList.remove('hidden');

            // 如果切换到账户管理标签，自动加载账户列表
            if (tab === 'manage' && document.getElementById('accountTableBody').children.length <= 1) {
                loadAccountList();
            }
        }

        async function makeRequest (url, options = {}) {
            const headers = {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            };

            // 添加认证头（直接使用管理密码作为Bearer令牌）
            if (adminPassword && !url.includes('/auth/config')) {
                headers['Authorization'] = `Bearer ${adminPassword}`;
            }

            const defaultOptions = {
                headers: {
                    ...headers,
                    ...(options.headers || {})
                },
                ...options
            };

            const response = await fetch(url, defaultOptions);

            // 如果返回401，清除密码并重定向到登录
            if (response.status === 401) {
                clearAdminPassword();
                showAdminLogin();
                throw new Error('管理密码错误，请重新登录');
            }

            return response;
        }

        async function login () {
            const email = document.getElementById('email').value;
            const refreshToken = document.getElementById('refreshToken').value;
            const clientId = document.getElementById('clientId').value;

            if (!email || !refreshToken || !clientId) {
                showError('请填写所有必需字段');
                return;
            }

            try {
                const response = await makeRequest(`${API_BASE}/accounts`, {
                    method: 'POST',
                    body: JSON.stringify({
                        email,
                        refresh_token: refreshToken,
                        client_id: clientId
                    })
                });

                if (!response.ok) throw new Error('验证失败');

                savedAccounts[email] = { refresh_token: refreshToken, client_id: clientId };
                localStorage.setItem('savedAccounts', JSON.stringify(savedAccounts));

                currentUser = email;
                showLoginSuccess();

            } catch (error) {
                showError('登录失败: ' + error.message);
            }
        }

        async function verifyBatchAccounts () {
            const batchText = document.getElementById('batchAccounts').value.trim();
            if (!batchText) {
                showError('请输入账户信息');
                return;
            }

            const lines = batchText.split('\n').filter(line => line.trim());
            const resultList = document.getElementById('verificationResultList');
            resultList.innerHTML = '<div class="verification-loading"><div class="spinner"></div><p>正在验证账户，请稍候...</p></div>';

            // 准备批量验证的账户列表
            const accounts = [];
            for (const line of lines) {
                const parts = line.split('----').map(p => p.trim());
                if (parts.length !== 4) continue;

                // const [email, _, refreshToken, clientId] = parts;
                const [email, _, clientId, refreshToken] = parts;
                accounts.push({
                    email,
                    refresh_token: refreshToken,
                    client_id: clientId
                });
            }

            if (accounts.length === 0) {
                resultList.innerHTML = '<div class="verification-empty"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><p>无法解析账户信息，请检查格式</p></div>';
                return;
            }

            try {
                const response = await makeRequest(`${API_BASE}/accounts/verify`, {
                    method: 'POST',
                    body: JSON.stringify({ accounts })
                });

                if (!response.ok) throw new Error('验证请求失败');

                const results = await response.json();
                renderVerificationResult(results);

            } catch (error) {
                resultList.innerHTML = `<div class="verification-empty"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg><p>验证失败: ${error.message}</p></div>`;
            }
        }

        async function importSelectedAccounts () {
            const checkboxes = document.querySelectorAll('.verification-checkbox-input:checked');
            if (checkboxes.length === 0) {
                showError('请至少选择一个要导入的账户');
                return;
            }

            const accounts = Array.from(checkboxes).map(cb => ({
                email: cb.dataset.email,
                refresh_token: cb.dataset.refreshToken,
                client_id: cb.dataset.clientId
            }));

            try {
                // 添加导入中的视觉反馈
                const importBtn = document.querySelector('.verification-import-btn');
                const originalText = importBtn.innerHTML;
                importBtn.innerHTML = '<div class="spinner spinner-sm"></div>导入中...';
                importBtn.disabled = true;

                const response = await makeRequest(`${API_BASE}/accounts/import`, {
                    method: 'POST',
                    body: JSON.stringify(accounts)
                });

                if (!response.ok) throw new Error('导入账户失败');

                const results = await response.json();
                const successCount = Array.isArray(results) ?
                    results.filter(r => !r.message.startsWith('Error')).length :
                    (results.message.includes('success') ? 1 : 0);

                // 更新本地存储
                for (const account of accounts) {
                    savedAccounts[account.email] = {
                        refresh_token: account.refresh_token,
                        client_id: account.client_id
                    };
                }
                localStorage.setItem('savedAccounts', JSON.stringify(savedAccounts));

                showSuccess(`成功导入 ${successCount} 个账户`);

                // 切换到账户管理标签页并刷新列表
                setTimeout(() => {
                    switchTab('manage');
                    loadAccountList();
                }, 1000);

            } catch (error) {
                showError('导入账户失败: ' + error.message);
                // 恢复按钮状态
                document.querySelector('.verification-import-btn').innerHTML = originalText;
                document.querySelector('.verification-import-btn').disabled = false;
            }
        }

        function renderVerificationResult (results) {
            const container = document.getElementById('verificationResultList');

            if (results.length === 0) {
                container.innerHTML = '<div class="verification-empty"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><p>未找到账户</p></div>';
                return;
            }

            const successCount = results.filter(r => r.status === 'success').length;
            const failCount = results.length - successCount;

            let html = `<div class="verification-summary ${successCount > 0 ? 'has-success' : 'all-failed'}">
                <div class="summary-icon">
                    ${successCount > 0 ?
                    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>' :
                    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'}
                </div>
                <div class="summary-text">
                    <h4>验证结果</h4>
                    <p>${successCount} 个成功, ${failCount} 个失败</p>
                </div>
            </div>`;

            // 添加表头
            html += `<div class="verification-header">
                <div class="verification-checkbox-header">
                    <input type="checkbox" id="selectAllVerified" onchange="toggleSelectAllVerified()" ${successCount > 0 ? '' : 'disabled'}>
                </div>
                <div class="verification-email-header">邮箱地址</div>
                <div class="verification-status-header">状态</div>
            </div>`;

            // 添加验证结果项
            results.forEach((result, index) => {
                const isSuccess = result.status === 'success';
                const delay = index * 50; // 添加延迟动画

                html += `
                <div class="verification-item ${isSuccess ? 'success' : 'failed'}" style="animation-delay: ${delay}ms;">
                    <div class="verification-checkbox">
                        <input type="checkbox" class="verification-checkbox-input" ${isSuccess ? 'checked' : 'disabled'} 
                            data-email="${result.email}" 
                            ${isSuccess ? `data-refresh-token="${result.credentials.refresh_token}" data-client-id="${result.credentials.client_id}"` : ''}>
                    </div>
                    <div class="verification-email">${result.email}</div>
                    <div class="verification-status">
                        <span class="verification-badge ${isSuccess ? 'success' : 'error'}">
                            ${isSuccess ?
                        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>' :
                        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'}
                            ${isSuccess ? '验证成功' : '验证失败'}
                        </span>
                        ${!isSuccess ? `<div class="verification-error-message">${result.message}</div>` : ''}
                    </div>
                </div>
                `;
            });

            // 添加导入按钮
            if (successCount > 0) {
                html += `
                <div class="verification-actions">
                    <button class="btn btn-primary verification-import-btn" onclick="importSelectedAccounts()">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                        导入选中账户
                    </button>
                </div>
                `;
            }

            container.innerHTML = html;
        }

        function toggleSelectAllVerified () {
            const isChecked = document.getElementById('selectAllVerified').checked;
            const checkboxes = document.querySelectorAll('.verification-checkbox-input:not([disabled])');

            checkboxes.forEach(checkbox => {
                checkbox.checked = isChecked;
            });
        }

        async function loadAccountList (forceCheck = false) {
            const tableBody = document.getElementById('accountTableBody');
            if (tableBody.children.length === 0 || tableBody.querySelector('.loading-row')) {
                tableBody.innerHTML = '<tr class="loading-row"><td colspan="5" style="text-align: center; padding: 40px;"><div class="spinner" style="margin: 0 auto 10px;"></div><p>加载数据中...</p></td></tr>';
            }

            try {
                // 调用后端API获取账户列表及其状态
                const response = await makeRequest(`${API_BASE}/accounts?check_status=${forceCheck}`);

                if (!response.ok) throw new Error('获取账户列表失败');

                const accounts = await response.json();
                renderAccountList(accounts);

                // 更新账户数量显示
                document.getElementById('accountCount').textContent = accounts.length;

            } catch (error) {
                tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #dc2626; padding: 20px;">加载失败: ${error.message}</td></tr>`;
            }
        }

        function renderAccountList (accounts) {
            const tbody = document.getElementById('accountTableBody');

            if (accounts.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #64748b;">暂无账户，请先添加账户</td></tr>';
                return;
            }

            let html = '';

            accounts.forEach((account, index) => {
                const statusClass = account.status === 'active' ? 'status-active' :
                    account.status === 'inactive' ? 'status-inactive' : 'status-unknown';
                const statusText = account.status === 'active' ? '有效' :
                    account.status === 'inactive' ? '无效' : '未知';

                // 直接使用API返回的数据
                const isSold = account.is_sold === true;
                const remark = account.remark || '';

                html += `
                <tr class="account-row ${isSold ? 'row-sold' : ''}" 
                     data-email="${account.email}" 
                     data-status="${account.status}"
                     data-sold="${isSold}">
                    
                    <td><input type="checkbox" class="account-checkbox" data-email="${account.email}"></td>
                    
                    <td><span class="account-email" onclick="loginWithAccount('${account.email}')">${account.email}</span></td>
                    
                    <td><span class="account-status ${statusClass}">${statusText}</span></td>
                    
                    <td>
                        <span class="tag ${isSold ? 'tag-sold' : 'tag-unsold'}" 
                              onclick="toggleSoldStatus('${account.email}', ${isSold})" 
                              title="点击切换状态">
                            ${isSold ? '已出售' : '未出售'}
                        </span>
                    </td>

                    <td class="remark-cell">
                        <input type="text" class="remark-input" 
                               value="${remark}" 
                               placeholder="添加备注..." 
                               onchange="updateRemark('${account.email}', this.value)"
                               onclick="event.stopPropagation()">
                    </td>
                </tr>
                `;
            });

            tbody.innerHTML = html;

            // 重置全选框
            document.getElementById('selectAllAccounts').checked = false;
        }

        // 切换销售状态 - 调用 API
        async function toggleSoldStatus (email, currentStatus) {
            const newStatus = !currentStatus;

            // 乐观更新 UI
            const row = document.querySelector(`tr[data-email="${email}"]`);
            if (row) {
                const tag = row.querySelector('.tag');

                // 更新状态及其样式
                tag.className = `tag ${newStatus ? 'tag-sold' : 'tag-unsold'}`;
                tag.textContent = newStatus ? '已出售' : '未出售';
                row.setAttribute('data-sold', newStatus);

                if (newStatus) row.classList.add('row-sold');
                else row.classList.remove('row-sold');

                // 更新onclick事件以反映新状态
                tag.onclick = () => toggleSoldStatus(email, newStatus);
            }

            try {
                const response = await makeRequest(`${API_BASE}/accounts/${email}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ is_sold: newStatus })
                });

                if (!response.ok) throw new Error('更新状态失败');

            } catch (error) {
                console.error(error);
                showError('更新状态失败: ' + error.message);
                // 应该回滚UI状态，这里暂略
            }
        }

        // 更新备注 - 调用 API
        async function updateRemark (email, value) {
            try {
                const response = await makeRequest(`${API_BASE}/accounts/${email}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ remark: value })
                });

                if (!response.ok) throw new Error('更新备注失败');

            } catch (error) {
                console.error(error);
                showError('保存备注失败: ' + error.message);
            }
        }

        function filterAccounts () {
            const searchTerm = document.getElementById('accountSearch').value.toLowerCase();
            const rows = document.querySelectorAll('#accountTableBody tr.account-row');

            rows.forEach(row => {
                const email = row.getAttribute('data-email').toLowerCase();
                const remarkInput = row.querySelector('.remark-input');
                const remark = remarkInput ? remarkInput.value.toLowerCase() : '';

                // 搜索同时匹配邮箱和备注
                if (email.includes(searchTerm) || remark.includes(searchTerm)) {
                    row.classList.remove('filtered');
                } else {
                    row.classList.add('filtered');
                }
            });
        }

        function filterByStatus (status) {
            // 更新按钮状态
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelector(`.filter-btn[data-filter="${status}"]`).classList.add('active');

            // 筛选账户列表
            const rows = document.querySelectorAll('#accountTableBody tr.account-row');

            rows.forEach(row => {
                const itemStatus = row.getAttribute('data-status');
                const isSold = row.getAttribute('data-sold') === 'true';

                let visible = false;

                if (status === 'all') {
                    visible = true;
                } else if (status === 'active' || status === 'inactive') {
                    visible = (itemStatus === status);
                } else if (status === 'sold') {
                    visible = isSold;
                } else if (status === 'unsold') {
                    visible = !isSold;
                }

                if (visible) {
                    row.classList.remove('filtered');
                } else {
                    row.classList.add('filtered');
                }
            });
        }

        function toggleSelectAll () {
            const isChecked = document.getElementById('selectAllAccounts').checked;
            // 只选择可见的行
            const visibleCheckboxes = document.querySelectorAll('#accountTableBody tr.account-row:not(.filtered) .account-checkbox');

            visibleCheckboxes.forEach(checkbox => {
                checkbox.checked = isChecked;
            });
        }

        function loginWithAccount (email) {
            // 移除 savedAccounts 检查，直接尝试登录
            // 添加加载动画
            const rows = document.querySelectorAll('tr.account-row');
            rows.forEach(row => {
                if (row.getAttribute('data-email') === email) {
                    row.style.backgroundColor = 'rgba(102, 126, 234, 0.1)';
                    // 选中的那一行
                }
            });

            currentUser = email;
            setTimeout(() => showLoginSuccess(), 300);
        }

        async function deleteSelectedAccounts () {
            const checkboxes = document.querySelectorAll('#accountTableBody .account-checkbox:checked');
            if (checkboxes.length === 0) {
                showError('请至少选择一个要删除的账户');
                return;
            }

            if (!confirm(`确定要删除选中的 ${checkboxes.length} 个账户吗？此操作不可撤销。`)) {
                return;
            }

            const emails = Array.from(checkboxes).map(cb => cb.dataset.email);

            try {
                const response = await makeRequest(`${API_BASE}/accounts`, {
                    method: 'DELETE',
                    body: JSON.stringify({ emails })
                });

                if (!response.ok) throw new Error('删除账户失败');

                const result = await response.json();

                // 移除本地存储（虽然现在不完全依赖它，但还是清理一下）
                emails.forEach(email => {
                    delete savedAccounts[email];
                });
                localStorage.setItem('savedAccounts', JSON.stringify(savedAccounts));

                showSuccess(result.message || `成功删除 ${result.deleted} 个账户`);

                // 重新加载列表
                setTimeout(() => loadAccountList(), 300);

            } catch (error) {
                showError('删除账户失败: ' + error.message);
            }
        }

        function showLoginSuccess () {
            // 这个函数现在处理邮箱账户登录成功后的逻辑
            if (!isPasswordSet()) {
                showAdminLogin();
                return;
            }

            document.getElementById('loginCard').classList.add('hidden');
            document.getElementById('emailCard').classList.remove('hidden');
            document.getElementById('userEmail').textContent = currentUser;

            // 加载账户选择器
            loadAccountSwitcher();

            showSuccess(`已登录: ${currentUser}`);
            loadDualEmails(false);
        }

        function logout () {
            currentUser = null;
            clearAdminPassword();

            // 重定向到管理员登录页面
            showAdminLogin();

            // 清空表单
            document.getElementById('email').value = '';
            document.getElementById('refreshToken').value = '';
            document.getElementById('clientId').value = '';
            document.getElementById('adminPassword').value = '';
        }

        let currentInboxPage = 1;
        let currentJunkPage = 1;

        async function loadDualEmails (forceRefresh = false) {
            const inboxList = document.getElementById('inboxList');
            const junkList = document.getElementById('junkList');

            // 添加加载动画
            const loadingHTML = '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
            inboxList.innerHTML = loadingHTML;
            junkList.innerHTML = loadingHTML;

            try {
                const response = await makeRequest(`${API_BASE}/emails/${currentUser}/dual-view?inbox_page=${currentInboxPage}&junk_page=${currentJunkPage}&page_size=20&force_refresh=${forceRefresh}`);
                if (!response.ok) throw new Error('获取邮件失败');

                const data = await response.json();

                // 更新邮件计数
                document.getElementById('inboxCount').textContent = data.inbox_total;
                document.getElementById('junkCount').textContent = data.junk_total;

                // 渲染收件箱邮件
                if (data.inbox_emails.length === 0) {
                    inboxList.innerHTML = '<div class="loading"><p>暂无邮件</p></div>';
                } else {
                    inboxList.innerHTML = data.inbox_emails.map(email => createEmailItem(email)).join('');
                }

                // 渲染垃圾邮件
                if (data.junk_emails.length === 0) {
                    junkList.innerHTML = '<div class="loading"><p>暂无邮件</p></div>';
                } else {
                    junkList.innerHTML = data.junk_emails.map(email => createEmailItem(email)).join('');
                }

                updateDualPagination(data.inbox_total, data.junk_total);

            } catch (error) {
                inboxList.innerHTML = '<div class="error">加载失败: ' + error.message + '</div>';
                junkList.innerHTML = '<div class="error">加载失败: ' + error.message + '</div>';
            }
        }

        function createEmailItem (email) {
            const readStatus = email.is_read ? 'read' : 'unread';
            const attachmentIcon = email.has_attachments ? '<span class="attachment-icon">📎</span>' : '';

            return `
                <div class="email-item" onclick="showEmailDetail('${email.message_id}')">
                    <div class="email-content-wrapper">
                        <div class="sender-avatar">
                            ${email.sender_initial}
                        </div>
                        <div class="email-info">
                            <div class="email-header">
                                <h3 class="email-subject">${email.subject || '(无主题)'}</h3>
                                <div class="email-meta">
                                    <span class="email-date">${formatEmailDate(email.date)}</span>
                                    <div class="email-status">
                                        <div class="status-indicator ${readStatus}"></div>
                                        ${attachmentIcon}
                                    </div>
                                </div>
                            </div>
                            <div class="email-from">📧 ${email.from_email}</div>
                            <div class="email-preview">点击查看邮件详情...</div>
                        </div>
                    </div>
                </div>
            `;
        }

        async function loadInboxPage (page) {
            currentInboxPage = page;
            await loadDualEmails(false);
        }

        async function loadJunkPage (page) {
            currentJunkPage = page;
            await loadDualEmails(false);
        }

        function sanitizeHTML (html) {
            // 创建一个临时div来解析HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;

            // 移除所有script标签
            const scripts = tempDiv.querySelectorAll('script');
            scripts.forEach(script => script.remove());

            // 移除可能的危险属性
            const allElements = tempDiv.querySelectorAll('*');
            allElements.forEach(element => {
                // 移除事件处理属性
                const attrs = [...element.attributes];
                attrs.forEach(attr => {
                    if (attr.name.startsWith('on') || attr.name === 'javascript:') {
                        element.removeAttribute(attr.name);
                    }
                });
            });

            return tempDiv.innerHTML;
        }

        function renderEmailContent (email) {
            const hasHtml = email.body_html && email.body_html.trim();
            const hasPlain = email.body_plain && email.body_plain.trim();

            if (!hasHtml && !hasPlain) {
                return '<p style="color: #94a3b8; font-style: italic;">此邮件无内容</p>';
            }

            // 如果有HTML内容，提供切换选项
            if (hasHtml) {
                const sanitizedHtml = sanitizeHTML(email.body_html);

                return `
                    <div class="email-content-header">
                        <div class="content-type-tabs">
                            <button class="content-tab active" onclick="showHtmlContent()" id="htmlTab">
                                🎨 HTML视图
                            </button>
                            ${hasPlain ? '<button class="content-tab" onclick="showPlainContent()" id="plainTab">📝 纯文本</button>' : ''}
                            <button class="content-tab" onclick="showRawContent()" id="rawTab">
                                🔍 源码
                            </button>
                        </div>
                    </div>
                    
                    <div id="htmlContent" class="email-content html-content">
                        <iframe srcdoc="${sanitizedHtml.replace(/"/g, '&quot;')}" 
                                style="width: 100%; min-height: 400px; border: 1px solid #e2e8f0; border-radius: 8px;"
                                sandbox="allow-same-origin">
                        </iframe>
                    </div>
                    
                    ${hasPlain ? `
                    <div id="plainContent" class="email-content plain-content hidden">
                        <button class="copy-button" onclick="copyToClipboard('plainContent')">
                            <svg class="copy-button-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            复制内容
                        </button>
                        <pre style="white-space: pre-wrap; font-family: inherit;">${email.body_plain}</pre>
                    </div>
                    ` : ''}
                    
                    <div id="rawContent" class="email-content raw-content hidden">
                        <button class="copy-button" onclick="copyToClipboard('rawContent')">
                            <svg class="copy-button-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            复制源码
                        </button>
                        <pre style="background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 12px;">${email.body_html.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                    </div>
                `;
            } else {
                // 只有纯文本
                return `
                    <div class="email-content plain-content">
                        <button class="copy-button" onclick="copyToClipboard('plainContent')">
                            <svg class="copy-button-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            复制内容
                        </button>
                        <pre style="white-space: pre-wrap; font-family: inherit; line-height: 1.6;">${email.body_plain}</pre>
                    </div>
                `;
            }
        }

        function showHtmlContent () {
            document.querySelectorAll('.content-tab').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.email-content').forEach(content => content.classList.add('hidden'));

            document.getElementById('htmlTab').classList.add('active');
            document.getElementById('htmlContent').classList.remove('hidden');
        }

        function showPlainContent () {
            document.querySelectorAll('.content-tab').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.email-content').forEach(content => content.classList.add('hidden'));

            document.getElementById('plainTab').classList.add('active');
            document.getElementById('plainContent').classList.remove('hidden');
        }

        function showRawContent () {
            document.querySelectorAll('.content-tab').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.email-content').forEach(content => content.classList.add('hidden'));

            document.getElementById('rawTab').classList.add('active');
            document.getElementById('rawContent').classList.remove('hidden');
        }

        function copyToClipboard (contentId) {
            // 获取要复制的内容
            const contentElement = document.getElementById(contentId);
            const textToCopy = contentElement.querySelector('pre').innerText;

            // 使用 Clipboard API 复制文本
            navigator.clipboard.writeText(textToCopy)
                .then(() => {
                    // 复制成功，更新按钮状态
                    const copyButton = contentElement.querySelector('.copy-button');
                    const originalText = copyButton.innerHTML;

                    copyButton.classList.add('copied');
                    copyButton.innerHTML = `
                        <svg class="copy-button-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        已复制
                    `;

                    // 2秒后恢复按钮状态
                    setTimeout(() => {
                        copyButton.classList.remove('copied');
                        copyButton.innerHTML = originalText;
                    }, 2000);

                    showSuccess('内容已复制到剪贴板');
                })
                .catch(err => {
                    console.error('复制失败:', err);
                    showError('复制失败，请手动选择并复制');
                });
        }

        async function showEmailDetail (messageId) {
            document.getElementById('emailCard').classList.add('hidden');
            document.getElementById('detailCard').classList.remove('hidden');

            const detailDiv = document.getElementById('emailDetail');
            detailDiv.innerHTML = '<div class="loading"><p>加载中...</p></div>';

            try {
                const response = await makeRequest(`${API_BASE}/emails/${currentUser}/${messageId}`);
                if (!response.ok) throw new Error('获取邮件详情失败');

                const email = await response.json();

                detailDiv.innerHTML = `
                    <div class="email-detail-header">
                        <h3 style="margin-bottom: 16px; color: #1e293b;">${email.subject || '(无主题)'}</h3>
                        <div class="email-meta-info">
                            <p><strong>发件人:</strong> ${email.from_email}</p>
                            <p><strong>收件人:</strong> ${email.to_email}</p>
                            <p><strong>日期:</strong> ${formatEmailDate(email.date)} (${new Date(email.date).toLocaleString()})</p>
                        </div>
                    </div>
                    <div class="email-content-container">
                        ${renderEmailContent(email)}
                    </div>
                `;

            } catch (error) {
                detailDiv.innerHTML = '<div class="error">加载失败: ' + error.message + '</div>';
            }
        }

        function backToList () {
            document.getElementById('detailCard').classList.add('hidden');
            document.getElementById('emailCard').classList.remove('hidden');
        }

        function backToAccountManage () {
            document.getElementById('emailCard').classList.add('hidden');
            document.getElementById('loginCard').classList.remove('hidden');
            switchTab('manage');
            loadAccountList();
        }

        async function loadAccountSwitcher () {
            try {
                const response = await makeRequest(`${API_BASE}/accounts`);
                if (!response.ok) throw new Error('获取账户列表失败');

                const accounts = await response.json();
                const switcher = document.getElementById('accountSwitcher');

                // 清空现有选项
                switcher.innerHTML = '<option value="">选择邮箱...</option>';

                // 添加账户选项
                accounts.forEach(account => {
                    const option = document.createElement('option');
                    option.value = account.email;
                    option.textContent = account.email;

                    // 标记当前账户
                    if (account.email === currentUser) {
                        option.selected = true;
                        option.textContent += ' (当前)';
                    }

                    // 根据状态添加标识
                    if (account.status === 'inactive') {
                        option.textContent += ' (无效)';
                        option.style.color = '#dc2626';
                    } else if (account.status === 'active') {
                        option.style.color = '#16a34a';
                    }

                    switcher.appendChild(option);
                });

            } catch (error) {
                console.error('加载账户选择器失败:', error);
            }
        }

        async function switchAccount () {
            const switcher = document.getElementById('accountSwitcher');
            const selectedEmail = switcher.value;

            if (!selectedEmail || selectedEmail === currentUser) {
                return;
            }

            if (!savedAccounts[selectedEmail]) {
                showError('账户信息不存在，请返回账户管理重新添加');
                switcher.value = currentUser; // 恢复原选择
                return;
            }

            // 添加切换动画
            const emailCard = document.getElementById('emailCard');
            emailCard.style.opacity = '0.5';
            emailCard.style.transition = 'opacity 0.3s ease';

            try {
                // 清除旧用户的缓存
                if (typeof email_cache !== 'undefined') {
                    // 这是前端缓存清理的占位符
                }

                currentUser = selectedEmail;
                document.getElementById('userEmail').textContent = currentUser;

                // 重新加载账户选择器以更新"当前"标识
                await loadAccountSwitcher();

                // 重新加载邮件
                currentInboxPage = 1;
                currentJunkPage = 1;
                await loadDualEmails(false);

                showSuccess(`已切换到: ${currentUser}`);

            } catch (error) {
                showError('切换邮箱失败: ' + error.message);
                switcher.value = currentUser; // 恢复原选择
            } finally {
                emailCard.style.opacity = '1';
            }
        }

        function updateDualPagination (inboxTotal, junkTotal) {
            const inboxPagination = document.getElementById('inboxPagination');
            const junkPagination = document.getElementById('junkPagination');

            // 更新收件箱分页
            const inboxPages = Math.ceil(inboxTotal / 20);
            if (inboxPages <= 1) {
                inboxPagination.classList.add('hidden');
            } else {
                inboxPagination.classList.remove('hidden');
                inboxPagination.innerHTML = `
                    <button class="btn btn-secondary" onclick="loadInboxPage(${currentInboxPage - 1})" ${currentInboxPage === 1 ? 'disabled' : ''}>‹</button>
                    <span>${currentInboxPage}/${inboxPages}</span>
                    <button class="btn btn-secondary" onclick="loadInboxPage(${currentInboxPage + 1})" ${currentInboxPage === inboxPages ? 'disabled' : ''}>›</button>
                `;
            }

            // 更新垃圾箱分页
            const junkPages = Math.ceil(junkTotal / 20);
            if (junkPages <= 1) {
                junkPagination.classList.add('hidden');
            } else {
                junkPagination.classList.remove('hidden');
                junkPagination.innerHTML = `
                    <button class="btn btn-secondary" onclick="loadJunkPage(${currentJunkPage - 1})" ${currentJunkPage === 1 ? 'disabled' : ''}>‹</button>
                    <span>${currentJunkPage}/${junkPages}</span>
                    <button class="btn btn-secondary" onclick="loadJunkPage(${currentJunkPage + 1})" ${currentJunkPage === junkPages ? 'disabled' : ''}>›</button>
                `;
            }
        }

        window.onload = function () {
            // 检查管理员认证状态
            if (isPasswordSet()) {
                showEmailManagement();
            } else {
                showAdminLogin();
            }
        };

        // 页面可见性变化时刷新账户选择器
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden && currentUser && document.getElementById('emailCard').classList.contains('hidden') === false) {
                loadAccountSwitcher();
            }
        });