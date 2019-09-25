'use strict';

window.onload = () => {
    var tabs = [];
    var activeTab = '';

    var keyCodes = [];
    // Shift
    keyCodes[18] = ')';
    keyCodes[19] = '!';
    keyCodes[20] = '@';
    keyCodes[21] = '#';
    keyCodes[22] = '$';
    keyCodes[25] = '&';
    keyCodes[26] = '*';
    keyCodes[27] = '(';
    keyCodes[156] = ':';
    keyCodes[157] = '+';
    keyCodes[159] = '_';
    keyCodes[161] = '?';

    // Normal
    keyCodes[186] = ';';
    keyCodes[187] = '=';
    keyCodes[188] = ',';
    keyCodes[189] = '-';
    keyCodes[190] = '.';
    keyCodes[191] = '/';
    keyCodes[192] = '~';
    keyCodes[219] = '[';
    keyCodes[221] = ']';
    keyCodes[222] = "'";

    var cspList = {};
    Windows.Storage.ApplicationData.current.localFolder.getFileAsync('filterlist.txt')
        .then(file => loadFilter(file), () => Windows.Storage.StorageFile.getFileFromApplicationUriAsync(Windows.Foundation.Uri('ms-appx:///filterlist.txt'))
            .then(file => {
                loadFilter(file);
                file.copyAsync(Windows.Storage.ApplicationData.current.localFolder);
            })
        )

    var frequencyList = {};
    Windows.Storage.ApplicationData.current.localFolder.getFileAsync('frequent.json')
        .then(file => { return Windows.Storage.FileIO.readTextAsync(file) })
        .then(text => text && (frequencyList = JSON.parse(text)));

    var currentView = Windows.UI.Core.SystemNavigationManager.getForCurrentView();
    currentView.appViewBackButtonVisibility = Windows.UI.Core.AppViewBackButtonVisibility.visible;
    currentView.onbackrequested = event => {
        event.detail[0].handled = activeTab.webView.canGoBack;
        backButton.click();
    };

    Windows.UI.WebUI.WebUIApplication.addEventListener('enteredbackground', () => MSApp.clearTemporaryWebDataAsync());

    Windows.UI.ViewManagement.InputPane.getForCurrentView().addEventListener('showing', () => {
        if (addressField.hasFocus) {
            addressField.selectionStart = 0;
            addressField.selectionEnd = addressField.value.length;
        }
    });

    Windows.UI.ViewManagement.InputPane.getForCurrentView().addEventListener('hiding', () => frequencyBar.innerHTML = '');

    var extendedExecution = Windows.ApplicationModel.ExtendedExecution.ExtendedExecutionSession();
    extendedExecution.reason = Windows.ApplicationModel.ExtendedExecution.ExtendedExecutionReason.unspecified;
    extendedExecution.addEventListener('revoked', () => activeTab.webView.stop());

    function loadFilter(file) {
        Windows.Storage.FileIO.readTextAsync(file).then(text => cspList = JSON.parse(text));
    }

    function saveFrequency() {
        Windows.Storage.ApplicationData.current.localFolder.createFileAsync('frequent.json', Windows.Storage.CreationCollisionOption.replaceExisting).then(file => Windows.Storage.FileIO.writeTextAsync(file, JSON.stringify(frequencyList)));
    }

    function callExtended(callback) {
        extendedExecution.close();
        extendedExecution.requestExtensionAsync().then(() => callback());
    }

    function browse(url) {
        activeTab.webView.stop();
        activeTab.webView.focus();

        url = url.trim().replace('https://', '').replace('http://', '').replace(/\/$/, '');
        if (url.includes('.') && !url.includes(' ')) {
            frequencyList[url] = frequencyList[url] + 1 || 1;
            saveFrequency();
            url = 'http://' + url;
        }
        else {
            url = 'https://duckduckgo.com/?q=' + url.replace(/ /g, '%20');
        }
        navigate(url);
    }

    function navigate(url) {
        callExtended(() => activeTab.webView.navigate(url));
    }

    function activateTab(tab) {
        if (activeTab) {
            activeTab.label.style.fontWeight = 'normal';
            activeTab.webView.remove();
        }
        activeTab = tab;
        activeTab.label.style.fontWeight = 'bold';
        webViewBar.appendChild(activeTab.webView);
        addressField.value = activeTab.webView.src;
    }

    function createTab() {
        var tab = { label: createLabel(), webView: [] };
        tab.webView = createWebView(tab.label);
        tab.label.addEventListener('click', () => activateTab(tab));
        tab.label.addEventListener('contextmenu', () => {
            if (tabs.length > 1) {
                tab.label.remove();
                tabs.splice(tabs.indexOf(tab), 1);
                activateTab(tabs[0]);
            }
        });
        tabLabels.appendChild(tab.label);
        activateTab(tab);
        return tab;
    };

    function createLabel() {
        var label = document.createElement('a');
        label.href = '#';
        label.className = 'tab';
        label.innerHTML = 'New tab';
        return label;
    }

    function createWebView(label) {
        var webView = document.createElement('x-ms-webview');
        webView.className = 'webView';

        webView.addEventListener('MSWebViewNavigationStarting', event => {
            label === activeTab.label && (addressField.value = event.uri || 'about:blank');
            progressBar.style.width = '0%';
        });

        webView.addEventListener('MSWebViewContentLoading', event => {
            var csp = JSON.stringify(cspList[Windows.Foundation.Uri(webView.src || 'about:blank').domain] || "default-src 'none';");
            webView.invokeScriptAsync('eval', 'var meta = document.createElement("meta");meta.httpEquiv = "Content-Security-Policy";meta.content = ' + csp + ';document.head.appendChild(meta);').start();
            webView.invokeScriptAsync('eval', 'window.violations = [];document.addEventListener("securitypolicyviolation", e => window.violations.push(e.effectiveDirective + " " + e.blockedURI + ";"))').start();
            frequencyBar.innerHTML = '';
            label.innerHTML = webView.documentTitle || webView.src;
            progressBar.style.width = '33%';
        });

        webView.addEventListener('MSWebViewDOMContentLoaded', () => progressBar.style.width = '66%');

        webView.addEventListener('MSWebViewNavigationCompleted', () => progressBar.style.width = '100%');

        webView.addEventListener('MSWebViewNewWindowRequested', event => {
            event.preventDefault();
            navigate(event.uri);
        });

        webView.addEventListener('MSWebViewUnviewableContentIdentified', event => Windows.System.Launcher.launchUriAsync(Windows.Foundation.Uri(event.uri)));

        webView.addEventListener('MSWebViewContainsFullScreenElementChanged', event => {
            var applicationView = Windows.UI.ViewManagement.ApplicationView.getForCurrentView();
            if (webView.containsFullScreenElement) {
                tabsBar.style.display = 'none';
                progressBar.style.display = 'none';
                frequencyBar.style.display = 'none';
                navigationBar.style.display = 'none';
                applicationView.tryEnterFullScreenMode();
            } else {
                tabsBar.style.display = '';
                progressBar.style.display = '';
                frequencyBar.style.display = '';
                navigationBar.style.display = '';
                applicationView.exitFullScreenMode();
            }
        });

        return webView;
    }

    addTab.addEventListener('click', () => tabs.push(createTab()));

    viewFilter.addEventListener('click', () => {
        var op = activeTab.webView.invokeScriptAsync('eval', 'window.violations.toString()');
        op.oncomplete = function (event) {
            violationField.value = [...new Set((event.target.result || '').split(','))].join('\n');
            filterField.value = (cspList[Windows.Foundation.Uri(activeTab.webView.src).domain] || "default-src 'none';").replace(/;/g, ';\n');
            filter.style.display = 'block';
        };
        op.start();
    });

    saveFilter.addEventListener('click', () => {
        cspList[Windows.Foundation.Uri(activeTab.webView.src).domain] = filterField.value.replace(/\n/g, '');
        Windows.Storage.ApplicationData.current.localFolder.getFileAsync('filterlist.txt')
            .then(file => Windows.Storage.FileIO.writeTextAsync(file, JSON.stringify(cspList))
                .then(() => filter.style.display = 'none')
            );
    });

    closeFilter.addEventListener('click', () => filter.style.display = 'none');

    addressBar.addEventListener('submit', event => {
        event.preventDefault();
        browse(addressField.value);
    });

    addressField.addEventListener('focus', event => setTimeout(event.target.select.bind(event.target), 0));

    addressField.addEventListener('keydown', event => {
        frequencyBar.innerHTML = '';

        var key = event.key;
        if (key === 'Escape') {
            addressField.value = activeTab.webView.src;
            activeTab.webView.focus();
        } else {
            if (key.length !== 1) {
                if (event.shiftKey) {
                    key = keyCodes[event.keyCode - 30] || key.toUpperCase();
                } else {
                    key = keyCodes[event.keyCode] || key;
                }
            }
            if (key.length === 1 && !event.ctrlKey && !event.altKey) {
                var before = addressField.value.substr(0, addressField.selectionStart).replace('https://', '').replace('http://', '');
                var after = addressField.value.substr(addressField.selectionEnd, addressField.value.length).replace(/\/$/, '');
                var typed = before + key + after;
                var urls = Object.keys(frequencyList).filter(url => url.startsWith(typed));
                if (urls.length > 0) {
                    urls.sort((urlA, urlB) => frequencyList[urlB] - frequencyList[urlA]);
                    addressField.value = urls[0];
                    addressField.selectionStart = typed.length;
                    addressField.selectionEnd = addressField.value.length;
                    urls.forEach(url => {
                        var link = document.createElement('a');
                        var div = document.createElement('div');
                        link.href = '#';
                        link.addEventListener('click', () => browse(url));
                        link.addEventListener('contextmenu', () => {
                            delete frequencyList[url];
                            link.remove();
                            saveFrequency();
                        });
                        div.className = 'frequencyItem';
                        div.innerHTML = url;
                        link.appendChild(div);
                        frequencyBar.appendChild(link);
                    });
                } else {
                    addressField.value = typed;
                    addressField.selectionStart = before.length + 1;
                    addressField.selectionEnd = before.length + 1;
                }
                event.preventDefault();
            }
        }
    });

    backButton.addEventListener('click', () => {
        callExtended(() => activeTab.webView.goBack());
        return false;
    });

    forwardButton.addEventListener('click', () => {
        callExtended(() => activeTab.webView.goForward());
        return false;
    });

    tabs.push(createTab());
};