#!/usr/bin/perl

use warnings;
use strict;
use open qw(:std :utf8);
use utf8;
use Getopt::Long;
use DBI;
use File::Path;
use File::Spec;
use File::Basename;
use Digest::MD5;
use DateTime::Format::Strptime;



my $outdir = '.';
my (@logfiles,$dbuser,$dbhost,$dbdatabase,$dbpassword);
my $dbport = 5432;
my $ignore = qr/\.(gif|jpg|jpeg|tiff|png|js|css|eot|ico|svg)$/;
my @services;
my %tokens;

my $strp = DateTime::Format::Strptime->new(
  pattern => '%d/%b/%Y:%H:%M:%S %z',
  on_error => 'croak',
);

GetOptions (
            'in-files=s{1,}' => \@logfiles,
            'out-dir=s' => \$outdir,
            'db-user=s' => \$dbuser,
            'db-host=s' => \$dbhost,
            'db-database=s' => \$dbdatabase,
            'db-password=s' => \$dbpassword,
            'db-port=i' => \$dbport,
        );


my $dbi = DBI->connect("dbi:Pg:host=$dbhost;database=$dbdatabase;port=$dbport", $dbuser, $dbpassword, { RaiseError => 1, AutoCommit => 0, ReadOnly => 1 });

unless($dbi){
  die "Unable to connect to database\n";
}

File::Path::mkpath($outdir) unless -d $outdir;

my $file_id = 1;

my $sql='
SELECT MAX(file_id) AS file_id
FROM log_files;
';

my $sth = $dbi->prepare($sql);
$sth->execute;
if(my $result = $sth->fetchrow_hashref){
  $file_id = $result->{file_id} + 1;
}

$sql='
SELECT service_id, prefix
FROM services
ORDER BY service_id;
';


$sth = $dbi->prepare($sql);
$sth->execute;
while(my $result = $sth->fetchrow_hashref){
  push @services, {id => $result->{service_id}, reg => $result->{prefix}}
}

$sql='
SELECT token_id, token, start_date, end_date
FROM user_tokens;
';


$sth = $dbi->prepare($sql);
$sth->execute;
while(my $result = $sth->fetchrow_hashref){
  $tokens{$result->{token}} = $result;
  $tokens{$result->{token}}->{start_date} =~ s/ /T/;
  $tokens{$result->{token}}->{end_date} =~ s/ /T/ if $tokens{$result->{token}}->{end_date};
}

for my $log_file_path (@logfiles) {
  print STDERR "TODO: Warn when multiple files logs the same day !!!\n";
  my @print_sql;
  my $log_file = basename($log_file_path);
  my $sql="SELECT 1 FROM log_files WHERE file_name='$log_file';";
  my $sth = $dbi->prepare($sql);
  $sth->execute;
  if(my $result = $sth->fetchrow_hashref){
    print STDERR "ERROR: skipping $log_file - file exists in database\n";
    next;
  }
  $file_id++;
  push @print_sql,'\cd :workingdir';

  push @print_sql,"DO \$\$ BEGIN RAISE NOTICE 'LOG FILE ($log_file) ID=$file_id'; END; \$\$; \n";

  my ($file_name) = $log_file =~ m/^(.*)\./;
  my $sql_file = "$file_name.sql";
  my ($first_line_checksum, $last_read_line_checksum, $lines_read, $lines_valid) = (undef, undef, 0, 0);
  open LOG, "<$log_file_path" or die "Could not open $log_file_path: $!";
  my $prev_date='';
  my $prev_time='';
  my $aggr_ip_data = {};
  $aggr_ip_data->{month}={};
  my $aggr_token_data = {};
  $aggr_token_data->{month}={};

  my $first_datetime;
  my $last_datetime;
  while(my $line = <LOG>){
    $lines_read++;
    $line =~ s/\n$//;
    my $escapedline = $line;
    $escapedline =~ s/\\/\\\\/g;
    $escapedline =~ s/^message repeated.*?\[ *(.*)\]$/$1/;
    my ($remote_addr, $remote_user, $time_local, $method, $request, $protocol, $status, $body_bytes_sent,$http_referer, $http_user_agent, $billing) =
        $escapedline =~ #/^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+) - ([^\s]+) \[(\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2} \+\d{4})\] +"([A-Z]+) ([^" ]*) ([^" ]*)" (2\d\d) ([-\d]*) "([^"]*)" "([^"]*)" [^\s]* [^\s]* [^\s](?: .*billing:infclen=(\d+))?/;
                        /^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+) - ([^\s]+) \[(\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2} \+\d{4})\] +"([A-Z]+) ([^" ]*) ([^" ]*)" (2\d\d) ([-\d]*) "([^"]*)" "([^"]*)" [^\s]* [^\s]* [^\s].*?(billing.*)$/;
    $billing = " $billing ";
    my ($unit) = $billing =~ / billing:infclen=([^ ]*) /;
    my ($token) = $billing =~ / billing:token=([^ ]*) /;
    $unit = 0 if not($unit) or $unit eq '-';
    my $token_id;
    if($status && $request !~ /$ignore/){
      $last_read_line_checksum = Digest::MD5::md5_hex($line);
      $first_line_checksum //= $last_read_line_checksum;
      my $service_id;
      for my $service (@services){
        if($request =~ $service->{reg}){
          $service_id = $service->{id};
          last if $service_id > 0;
        }
      }
      next unless defined $service_id;
      my $act_date = $time_local;
      $act_date =~ s/\d{2}:\d{2}:\d{2} \+/00:00:00 \+/;
      my $act_time = $time_local;
      $act_time =~ s/:\d{2}:\d{2} \+/:00:00 \+/;
      $token_id = get_token_id($token,$strp->parse_datetime($time_local));
      unless($act_date eq $prev_date){
        unless($lines_valid){
          close DUMP_IP_AGGR;
        }
        print_aggregated_ip_data(\*DUMP_IP_AGGR, $aggr_ip_data,$prev_date,'day');
        print_aggregated_token_data(\*DUMP_TOKEN_AGGR, $aggr_token_data,$prev_date,'day');
        $aggr_ip_data->{day}={};
        $aggr_token_data->{day}={};
        my $date_filename = join('-',split('/',substr($act_date,0,11)));

        my $dump_ip_aggr_file = "$file_name.ip_aggr.dump";
        push @print_sql,"DO \$\$ BEGIN RAISE NOTICE 'IMPORTING HOUR AND DAY AGGR--------------[\%]----------------', NOW();END;\$\$;";
        push @print_sql,"\\copy log_ip_aggr(period_start_date, period_end_date, period_level, ip, service_id, cnt_requests, cnt_units, cnt_body_bytes_sent, token_used) from '$dump_ip_aggr_file'";
        open DUMP_IP_AGGR, ">".File::Spec->catfile($outdir,$dump_ip_aggr_file) or die "Could not open $dump_ip_aggr_file: $!";

        my $dump_token_aggr_file = "$file_name.token_aggr.dump";
        push @print_sql,"DO \$\$ BEGIN RAISE NOTICE 'IMPORTING HOUR AND DAY AGGR--------------[\%]----------------', NOW();END;\$\$;";
        push @print_sql,"\\copy log_aggr(period_start_date, period_end_date, period_level, token_id, service_id, cnt_requests, cnt_units, cnt_body_bytes_sent) from '$dump_token_aggr_file'";
        open DUMP_TOKEN_AGGR, ">".File::Spec->catfile($outdir,$dump_token_aggr_file) or die "Could not open $dump_token_aggr_file: $!";

        $prev_date = $act_date;
        $first_datetime = $time_local unless $first_datetime;
        $last_datetime = $time_local;
      }
      unless($act_time eq $prev_time){
        print_aggregated_ip_data(\*DUMP_IP_AGGR, $aggr_ip_data, $prev_time,'hour');
        print_aggregated_token_data(\*DUMP_TOKEN_AGGR, $aggr_token_data, $prev_time,'hour');
        $aggr_ip_data->{hour}={};
        $aggr_token_data->{hour}={};
        $prev_time = $act_time;
      }


      $lines_valid++;
      for my $ip ($remote_addr, '\N') {
        for my $service ($service_id, '\N'){
          aggregate_data($aggr_ip_data, $aggr_token_data, $ip, $service, 1, $unit, $body_bytes_sent,$token_id);
        }
      }
    }
  }

  print_aggregated_ip_data(\*DUMP_IP_AGGR, $aggr_ip_data,$prev_time,'hour');
  print_aggregated_ip_data(\*DUMP_IP_AGGR, $aggr_ip_data,$prev_date,'day');
  close DUMP_IP_AGGR;
  print_aggregated_token_data(\*DUMP_TOKEN_AGGR, $aggr_token_data,$prev_time,'hour');
  print_aggregated_token_data(\*DUMP_TOKEN_AGGR, $aggr_token_data,$prev_date,'day');
  close DUMP_TOKEN_AGGR;
  close LOG;


  my $act_month = $prev_date; $act_month =~ s/^../01/;
  my $month_aggr_sql = add_aggregate_data_string($aggr_ip_data,$act_month,'month');
  push @print_sql,"$month_aggr_sql";

  # generating endpoints data
  push @print_sql," -- aggregating endpoints data
-- hour + day aggregations
INSERT INTO log_aggr
(
        period_start_date,
        period_end_date,
        period_level,
        endpoint_id,
        service_id,
        cnt_requests,
        cnt_units,
        cnt_body_bytes_sent
)
SELECT li.period_start_date,li.period_end_date,li.period_level,ue.endpoint_id,li.service_id,li.cnt_requests,li.cnt_units,li.cnt_body_bytes_sent
FROM
  log_ip_aggr li
  JOIN
  user_endpoints ue
  ON li.ip = ue.ip
WHERE
  li.period_start_date >= '$first_datetime'
  AND ue.start_date >= li.period_start_date
  AND (li.period_level = 'hour' OR li.period_level = 'day')
  AND ue.is_active = TRUE
  AND li.token_used = FALSE;

-- remove month aggregations
DELETE FROM log_aggr
WHERE
  period_level = 'month'
  AND period_end_date > '$first_datetime';

-- insert new month endpoint aggregations


INSERT INTO log_aggr
(
        period_start_date,
        period_end_date,
        period_level,
        endpoint_id,
        service_id,
        cnt_requests,
        cnt_units,
        cnt_body_bytes_sent
)
SELECT
  li.period_start_date,
  li.period_end_date,
  li.period_level,
  la.endpoint_id,
  la.service_id,
  sum(la.cnt_requests),
  sum(la.cnt_units),
  sum(la.cnt_body_bytes_sent)
FROM
  log_ip_aggr li
  JOIN
  user_endpoints ue
  ON
    li.ip = ue.ip
  JOIN
  log_aggr la
  ON
    ue.endpoint_id = la.endpoint_id
    AND li.service_id = la.service_id
    AND la.period_start_date >= li.period_start_date
    AND la.period_end_date <= li.period_end_date
    AND la.token_id IS NULL
WHERE
  la.period_start_date >= '$first_datetime'
  AND li.period_level = 'month'
  AND la.period_level = 'day'
GROUP BY
  li.period_start_date,
  li.period_end_date,
  li.period_level,
  la.endpoint_id,
  la.service_id;

-- TODO insert token month aggregations '$first_datetime' -- '$last_datetime'


    with intervals as (
      select generate_series(
        date_trunc('month', timestamp '$first_datetime'),
        date_trunc('month', timestamp '$last_datetime'),
        '1 month'::interval
      ) as interval
    )
INSERT INTO log_aggr
(
        period_start_date,
        period_end_date,
        period_level,
        token_id,
        service_id,
        cnt_requests,
        cnt_units,
        cnt_body_bytes_sent
)
SELECT
        intervals.interval AS period_start_date,
        intervals.interval+interval '1 month' AS period_end_date,
        'month' AS period_level,
        la.token_id,
        la.service_id,
        sum(la.cnt_requests),
        sum(la.cnt_units),
        sum(la.cnt_body_bytes_sent)
         FROM
            intervals
            JOIN
              (SELECT *
                FROM log_aggr
                WHERE period_level = 'day'::period_levels
                   AND token_id IS NOT NULL
                ) la
              ON la.period_start_date >= intervals.interval
                AND la.period_start_date < intervals.interval + interval '1 month'
          GROUP BY
            intervals.interval,
            la.service_id,
            la.token_id;

";


  # writting sql commands
  open SQL, ">".File::Spec->catfile($outdir,$sql_file) or die "Could not open $sql_file: $!";
  print SQL " -- $log_file sql dump
DO \$\$ BEGIN RAISE NOTICE 'STARTED--------------[\%]----------------', NOW(); END; \$\$;
ALTER TABLE log_file_entries DISABLE TRIGGER log_files_lines_read;
ALTER TABLE log_file_entries DISABLE TRIGGER log_files_lines_read_aggr;


INSERT
INTO log_files(file_id, file_name, first_line_checksum, last_read_line_checksum, lines_read, lines_valid, tail)
VALUES($file_id,'$log_file','$first_line_checksum', '$last_read_line_checksum', $lines_read, $lines_valid,FALSE);
";
  print SQL "$_\n" for @print_sql;

  print SQL "
ALTER TABLE log_file_entries ENABLE TRIGGER log_files_lines_read;
ALTER TABLE log_file_entries ENABLE TRIGGER log_files_lines_read_aggr;
DO \$\$ BEGIN RAISE NOTICE 'FINISHED--------------[\%]----------------', NOW(); END; \$\$;

";

  print STDERR "imported period: $first_datetime  --  $last_datetime\n";

  close SQL;

  $first_datetime =~ s/:\d{2}:\d{2} \+/:00:00 \+/;
  $last_datetime =~ s/:\d{2}:\d{2} \+/:00:00 \+/;
  $last_datetime = $strp->parse_datetime($last_datetime)->add(hours => 1)->strftime('%d/%b/%Y:%H:%M:%S %z');
  print STDERR "aggregated period: $first_datetime  --  $last_datetime\n";

  for my $bound (['lower', $first_datetime],['upper',$last_datetime]){
    print STDERR "TESTING ",$bound->[0],": ",$bound->[1],"\n";
    my $dt = $bound->[1];
    for my $level (qw/hour day month/){
      $sql="
SELECT count(1) AS cnt
FROM log_ip_aggr
WHERE
  period_start_date <= '$dt'
  AND period_end_date > '$dt'
  AND period_level = '$level'::period_levels;
";
      $sth = $dbi->prepare($sql);
      $sth->execute;
      if(my $result = $sth->fetchrow_hashref){
        print STDERR "  WARNING: ",$result->{cnt}," records cross boundary on $level level in existing database !!! \n\t-> IT PRODUCES DUPLICITIES WHEN IMPORT THIS\n" if $result->{cnt};
      }
    }
  }
}


$dbi->disconnect();


sub print_aggregated_ip_data{
  my ($fh,$aggr_ip_data, $start_time, $period) = @_;
  return unless $start_time;
  my $end_time = $strp->parse_datetime($start_time);
  $end_time->add("${period}s" => 1);
  $end_time = $end_time->strftime('%d/%b/%Y:%H:%M:%S %z');
  for my $ip (keys %{$aggr_ip_data->{$period}}) {
    for my $token_used (keys %{$aggr_ip_data->{$period}->{$ip}}) {
      for my $service (keys %{$aggr_ip_data->{$period}->{$ip}->{$token_used}}){
        print $fh join("\t",$start_time, $end_time, $period,$ip,$service,@{$aggr_ip_data->{$period}->{$ip}->{$token_used}->{$service}},$token_used),"\n";
      }
    }
  }
}

sub print_aggregated_token_data{
  my ($fh,$aggr_token_data, $start_time, $period) = @_;
  return unless $start_time;
  my $end_time = $strp->parse_datetime($start_time);
  $end_time->add("${period}s" => 1);
  $end_time = $end_time->strftime('%d/%b/%Y:%H:%M:%S %z');
  for my $token_id (keys %{$aggr_token_data->{$period}}) {
    for my $service (keys %{$aggr_token_data->{$period}->{$token_id}}){
      print $fh join("\t",$start_time, $end_time, $period,$token_id,$service,@{$aggr_token_data->{$period}->{$token_id}->{$service}}),"\n";
    }
  }
}


sub aggregate_data{
  my ($data_ip, $data_token, $ip, $service, $request, $unit, $body_bytes_sent,$token_id) = @_;
  for my $period (qw/hour day month/){
    $data_ip->{$period}->{$ip} //= {0 => {}, 1 => {}};
    if(defined $token_id){
      $data_token->{$period}->{$token_id} //= {};
      $data_token->{$period}->{$token_id}->{$service} //= [0, 0, 0];
      $data_token->{$period}->{$token_id}->{$service}->[0] += 1; ## requests
      $data_token->{$period}->{$token_id}->{$service}->[1] += $unit; ## units
      $data_token->{$period}->{$token_id}->{$service}->[2] += $body_bytes_sent; ## body_bytes_sent
    } else { # aggregation without used tokens
      $data_ip->{$period}->{$ip}->{0}->{$service} //= [0, 0, 0];
      $data_ip->{$period}->{$ip}->{0}->{$service}->[0] += 1; ## requests
      $data_ip->{$period}->{$ip}->{0}->{$service}->[1] += $unit; ## units
      $data_ip->{$period}->{$ip}->{0}->{$service}->[2] += $body_bytes_sent; ## body_bytes_sent
    }
    $data_ip->{$period}->{$ip}->{1}->{$service} //= [0, 0, 0];
    $data_ip->{$period}->{$ip}->{1}->{$service}->[0] += 1; ## requests
    $data_ip->{$period}->{$ip}->{1}->{$service}->[1] += $unit; ## units
    $data_ip->{$period}->{$ip}->{1}->{$service}->[2] += $body_bytes_sent; ## body_bytes_sent
  }
}

sub add_aggregate_data_string{
  my ($aggr_ip_data, $start_time, $period) = @_;
  return unless $start_time;
  my $str = '';
  my $end_time = $strp->parse_datetime($start_time);
  $end_time->add("${period}s" => 1);
  $end_time = $end_time->strftime('%d/%b/%Y:%H:%M:%S %z');
  for my $ip (keys %{$aggr_ip_data->{$period}}) {
    for my $token_used (keys %{$aggr_ip_data->{$period}->{$ip}}) {
      for my $service (keys %{$aggr_ip_data->{$period}->{$ip}->{$token_used}}){
        my $restrictions = sprintf(" WHERE period_start_date='%s' "
                      ."AND period_level='%s' "
                      ."AND token_used=%s "
                      ."AND %s "
                      ."AND %s ", $start_time, $period, $token_used?'TRUE':'FALSE', sql_equal_statement('ip',$ip), sql_equal_statement('service_id', $service));
        $str .= sprintf("UPDATE log_ip_aggr SET cnt_requests = cnt_requests + %d, cnt_units = cnt_units + %d, cnt_body_bytes_sent = cnt_body_bytes_sent + %d "
                      ."%s;\n", @{$aggr_ip_data->{$period}->{$ip}->{$token_used}->{$service}}, $restrictions);
        $str .= sprintf("INSERT INTO log_ip_aggr(period_start_date, period_end_date, period_level, ip, service_id, cnt_requests, cnt_units, cnt_body_bytes_sent, token_used)"
                      ."SELECT '%s', '%s', '%s', "
                      ."%s, %s, %d, %d, %d, %s "
                      ."WHERE NOT EXISTS (SELECT 1 FROM log_ip_aggr %s);\n",
                      $start_time, $end_time, $period,
                      ($ip eq '\N')?"NULL":"'$ip'",
                      ($service eq '\N')?"NULL":"'$service'",
                      @{$aggr_ip_data->{$period}->{$ip}->{$token_used}->{$service}},
                      $token_used?'TRUE':'FALSE',
                      $restrictions);
      }
    }
  }
  return $str;
}

sub sql_equal_statement{
  my ($field,$value) = @_;
  return $value eq '\N' ? "$field IS NULL" : sprintf("%s='%s'",$field,$value);
}

sub get_token_id{
  my ($token,$datetime) = @_;
  return unless $token;
  return if $token eq '-';
  print STDERR "TODO: token+datetime '$token' '$datetime'\n";
  return unless defined $tokens{$token};
  print STDERR "\t",$tokens{$token}->{start_date},"---",($tokens{$token}->{end_date}//'ACTIVE'),"\n";
  return if $tokens{$token}->{start_date} gt $datetime;
  return if $tokens{$token}->{end_date} && $tokens{$token}->{start_date} lt $datetime;
  return $tokens{$token}->{token_id};
}