param(
  [Parameter(Mandatory = $true)]
  [Uri]$Uri,

  [Parameter(Mandatory = $true)]
  [string]$CookieHeader,

  [ValidateRange(1, 30)]
  [int]$TimeoutSec = 5,

  [switch]$WithDiagnostic
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# DEV GET only. Never send owner credentials to a remote host or follow redirects.
if (-not $Uri.IsAbsoluteUri -or $Uri.Scheme -cne "http" -or
    (@("localhost", "127.0.0.1") -cnotcontains $Uri.Host) -or
    $Uri.UserInfo -or $Uri.Fragment) {
  throw "Session pre-check requires a local HTTP URL without user information or fragment."
}
if ($CookieHeader -cnotmatch '\Awetscan_session=[a-f0-9]{64}\z') {
  throw "Session pre-check requires exactly one valid wetscan_session cookie."
}

# Windows PowerShell 5.1 drops Cookie supplied through -Headers. Its
# HttpWebRequest sends cookies from CookieContainer instead.
$webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$sessionCookie = New-Object System.Net.Cookie
$sessionCookie.Name = "wetscan_session"
$sessionCookie.Value = $CookieHeader.Substring("wetscan_session=".Length)
$sessionCookie.Path = "/"
$webSession.Cookies.Add($Uri, $sessionCookie)

$stage = 'transport'; $httpStatus = $null; $response = $null; $reader = $null
try {
  # Read status separately from JSON parsing; never retain a body in diagnostics.
  # PS 5.1 Invoke-WebRequest hides redirect status in MaximumRedirectExceeded.
  # HttpWebRequest retains that status and attaches the same CookieContainer.
  $request = [Net.HttpWebRequest]::Create($Uri)
  $request.Method = 'GET'; $request.AllowAutoRedirect = $false
  $request.CookieContainer = $webSession.Cookies
  $request.Timeout = $TimeoutSec * 1000; $request.ReadWriteTimeout = $TimeoutSec * 1000
  $response = $request.GetResponse()
  $httpStatus = [int]$response.StatusCode
  $stage = 'http'
  if ($httpStatus -ne 200) { throw 'session_get_http_status' }
  $stage = 'response_parse'
  $reader = New-Object IO.StreamReader($response.GetResponseStream())
  $data = $reader.ReadToEnd() | ConvertFrom-Json -ErrorAction Stop
  if ($null -eq $data -or $data -isnot [pscustomobject]) { throw 'session_get_response_schema' }
  $diagnostic = @{status='PASS';stage='complete';category='success';httpStatus=$httpStatus;transportStatus=$null}
  if ($WithDiagnostic) { return @{data=$data;diagnostic=$diagnostic} }
  return $data
} catch {
  $failure = $_
  $exception = $_.Exception; $webError = $null
  for ($i=0; $exception -and $i -lt 8; $i++) {
    if ($exception -is [Net.WebException]) { $webError=$exception; break }
    $exception=$exception.InnerException
  }
  $transportStatus = $null
  if ($webError) {
    $transportStatus = $webError.Status.ToString()
    if ($webError.Response -is [Net.HttpWebResponse]) { $response=$webError.Response; $httpStatus=[int]$response.StatusCode; $stage='http' }
  }
  # HTTP failures only: retain one allowlisted route error code, never the body.
  # Reads at most 2048 bytes once; anything unparseable or unlisted is reduced to
  # a fixed marker. Raw bodies, HTML, headers and cookies are never retained.
  $errorCode = $null
  if ($response -is [Net.HttpWebResponse] -and $httpStatus -ge 400) {
    try {
      $allowedErrorCodes = @('github_oauth_error','github_invalid_request','github_expired','github_denied','github_not_found','github_validation','github_rate_limited','github_unavailable','github_response','github_permissions','github_app_credentials','github_setup_misconfigured','github_app_key_invalid','github_app_mismatch','installation_denied','repository_denied','account_mismatch','unauthenticated','onboarding_incomplete','not_found','invalid_query','invalid_id','invalid_origin','configuration','telemetry_not_configured','telemetry_unavailable','method_not_allowed')
      $errorStream = $response.GetResponseStream()
      $buffer = New-Object byte[] 2048; $total = 0
      while ($total -lt $buffer.Length) {
        $count = $errorStream.Read($buffer, $total, $buffer.Length - $total)
        if ($count -le 0) { break }
        $total += $count
      }
      $parsed = [Text.Encoding]::UTF8.GetString($buffer, 0, $total) | ConvertFrom-Json -ErrorAction Stop
      $candidate = if ($parsed -is [pscustomobject] -and $parsed.PSObject.Properties['error']) { $parsed.error } else { $null }
      $errorCode = if ($candidate -is [string] -and ($allowedErrorCodes -ccontains $candidate)) { $candidate } else { 'unlisted_error_code' }
    } catch { $errorCode = 'unavailable_error_code' }
    finally { $buffer = $null }
  }
  $category = if ($httpStatus -eq 401) { 'unauthenticated' }
    elseif ($httpStatus -eq 403) { 'forbidden' }
    elseif ($httpStatus -ge 300 -and $httpStatus -lt 400) { 'redirect_refused' }
    elseif ($httpStatus -and $httpStatus -ne 200) { 'http_failure' }
    elseif ($stage -ceq 'response_parse') { 'response_parse_failed' }
    elseif ($transportStatus -ceq 'Timeout') { 'timeout' }
    elseif ($transportStatus -ceq 'ConnectFailure') { 'connection_refused' }
    elseif ($transportStatus) { 'transport_failed' }
    else { 'request_failed' }
  # Fixed enum/status fields only. No exception text, URL, headers or body.
  $failure.Exception.Data['S04SessionDiagnostic'] = @{status='NOT_VERIFIED';stage=$stage;category=$category;httpStatus=$httpStatus;transportStatus=$transportStatus;errorCode=$errorCode}
  throw
} finally {
  if ($reader) { $reader.Dispose() }
  if ($response) { $response.Close() }
}
